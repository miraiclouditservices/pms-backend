const Lease = require('../models/Lease');
const LeaseHistory = require('../models/LeaseHistory');
const Notification = require('../models/Notification');
const Unit = require('../models/Unit');
const User = require('../models/User');

async function runLeaseAutomation() {
    console.log('--- Starting Daily Lease Automation Job ---');
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Process Expired Leases
        const activeLeases = await Lease.find({ status: { $in: ['Active', 'Renewal Pending'] } });
        
        for (const lease of activeLeases) {
            // Auto-heal missing property/floor references if they exist on the units
            if ((!lease.property || !lease.floor) && lease.units && lease.units.length > 0) {
                try {
                    const firstUnit = await Unit.findById(lease.units[0]);
                    if (firstUnit) {
                        if (!lease.property && firstUnit.property) {
                            lease.property = firstUnit.property;
                            console.log(`[Auto-Heal] Set property for lease ${lease._id} from unit ${firstUnit.unitNumber}`);
                        }
                        if (!lease.floor && firstUnit.floor) {
                            lease.floor = firstUnit.floor;
                            console.log(`[Auto-Heal] Set floor for lease ${lease._id} from unit ${firstUnit.unitNumber}`);
                        }
                    }
                } catch (healErr) {
                    console.error(`[Auto-Heal Error] Failed to heal lease ${lease._id}:`, healErr);
                }
            }

            const endDate = new Date(lease.endDate);
            endDate.setHours(0, 0, 0, 0);

            if (endDate < today) {
                console.log(`Lease ${lease._id} for ${lease.tenantName} has expired. Updating status.`);
                
                const oldStatus = lease.status;
                lease.status = 'Expired';
                await lease.save({ validateBeforeSave: false });

                // Clear unit status back to Available
                if (lease.units && lease.units.length > 0) {
                    await Unit.updateMany(
                        { _id: { $in: lease.units } },
                        { unitStatus: 'Vacant' }
                    );
                }

                // Log in history
                await LeaseHistory.create({
                    lease: lease._id,
                    action: 'Expired',
                    previousStatus: oldStatus,
                    newStatus: 'Expired',
                    remarks: 'Automated job: lease contract ended.'
                });

                // Notify Admins
                const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'STAFF_ADMIN'] } });
                for (const admin of admins) {
                    await Notification.create({
                        user: admin._id,
                        title: 'Lease Contract Expired',
                        message: `The lease for ${lease.tenantName} at property has expired. Units are set back to Vacant.`,
                        type: 'Alert'
                    });
                }
            } else {
                // 2. Auto-expiry Alerts (30, 15, 7 days remaining)
                const diffTime = endDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if ([30, 15, 7].includes(diffDays)) {
                    console.log(`Lease ${lease._id} is expiring in ${diffDays} days. Triggering notifications.`);
                    
                    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'FLOOR_ADMIN', 'STAFF_ADMIN'] } });
                    for (const admin of admins) {
                        await Notification.create({
                            user: admin._id,
                            title: `Lease Expiring in ${diffDays} Days`,
                            message: `Notice: Lease for ${lease.tenantName} expires on ${endDate.toLocaleDateString()}. Please initiate renewal negotiations.`,
                            type: 'Reminder'
                        });
                    }
                }

                // 3. Escalation Logic (Anniversary check)
                const startDate = new Date(lease.startDate);
                const yearsElapsed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24 * 365.25));

                if (yearsElapsed > 0 && lease.escalationPercentage > 0) {
                    // Check if an escalation has already been logged for this anniversary year
                    const escalationLog = await LeaseHistory.findOne({
                        lease: lease._id,
                        action: 'Escalated',
                        changedAt: { 
                            $gte: new Date(today.getFullYear(), 0, 1),
                            $lte: new Date(today.getFullYear(), 11, 31)
                        }
                    });

                    if (!escalationLog) {
                        console.log(`Applying ${lease.escalationPercentage}% escalation on Lease ${lease._id} for anniversary year ${yearsElapsed}.`);
                        
                        const oldRentPerSft = lease.rentPerSft || 0;
                        const newRentPerSft = oldRentPerSft * (1 + (lease.escalationPercentage / 100));
                        
                        const oldMonthlyRent = lease.monthlyRent;
                        const newMonthlyRent = oldMonthlyRent * (1 + (lease.escalationPercentage / 100));

                        const oldTotalAmount = lease.totalMonthlyAmount || 0;
                        const newTotalAmount = oldTotalAmount * (1 + (lease.escalationPercentage / 100));

                        lease.rentPerSft = parseFloat(newRentPerSft.toFixed(2));
                        lease.monthlyRent = Math.round(newMonthlyRent);
                        lease.totalMonthlyAmount = Math.round(newTotalAmount);

                        await lease.save({ validateBeforeSave: false });

                        // Log history
                        await LeaseHistory.create({
                            lease: lease._id,
                            action: 'Escalated',
                            previousRent: oldMonthlyRent,
                            newRent: lease.monthlyRent,
                            remarks: `Automated Yearly rent escalation of ${lease.escalationPercentage}% applied.`
                        });

                        // Notify
                        const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'STAFF_ADMIN'] } });
                        for (const admin of admins) {
                            await Notification.create({
                                user: admin._id,
                                title: 'Rent Escalation Applied',
                                message: `Yearly ${lease.escalationPercentage}% escalation applied to lease for ${lease.tenantName}. Rent increased from ₹${oldMonthlyRent} to ₹${lease.monthlyRent}.`,
                                type: 'Info'
                            });
                        }
                }
            }
        }
        }

        // 4. Send Management Payment Reminder Notifications to Users 5 Days Before Payment is Due
        console.log('Checking user management payment schedules...');
        const usersForReminder = await User.find({
            role: { $in: ['FLOOR_ADMIN', 'OFFICE_OWNER', 'Owner'] },
            agreementStatus: 'Active'
        });

        for (const u of usersForReminder) {
            if (!u.paymentDueDay) continue;

            // Calculate next due date
            const nextDue = new Date(today.getFullYear(), today.getMonth(), u.paymentDueDay);
            // If the due day of this month has already passed, the next due date is next month
            if (nextDue < today) {
                nextDue.setMonth(nextDue.getMonth() + 1);
            }

            const diffTime = nextDue - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // If it is exactly 5 days before the due date, create notification
            if (diffDays === 5) {
                console.log(`User ${u.name} payment due in 5 days (${nextDue.toLocaleDateString()}). Triggering notification.`);
                
                // Verify notification doesn't exist yet for today to avoid duplicates
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                
                const existingNotif = await Notification.findOne({
                    user: u._id,
                    title: 'Upcoming Management Payment Reminder',
                    createdAt: { $gte: startOfDay, $lt: endOfDay }
                });

                if (!existingNotif) {
                    await Notification.create({
                        user: u._id,
                        title: 'Upcoming Management Payment Reminder',
                        message: `Reminder: Your monthly management payment of ₹${u.monthlyManagementAmount || 0} is due on ${nextDue.toLocaleDateString()} (in 5 days). Please pay on time.`,
                        type: 'Reminder'
                    });
                }
            }
        }

        console.log('--- Lease Automation Job Completed ---');
    } catch (err) {
        console.error('Error during Lease Automation Job:', err);
    }
}

module.exports = {
    runLeaseAutomation
};
