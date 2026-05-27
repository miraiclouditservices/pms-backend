const dns = require('dns');

dns.resolveSrv('_mongodb._tcp.cluster0.rhq9af9.mongodb.net', (err, addresses) => {
    if (err) {
        console.error('SRV Error:', err);
    } else {
        console.log('SRV Addresses:', addresses);
    }
});
