const net=require('node:net');
function publicIP(ip){const a=ip.split('.').map(Number);return net.isIP(ip)===4&&a[0]!==0&&a[0]!==10&&a[0]!==127&&a[0]!==169&&a[0]<224&&!(a[0]===100&&a[1]>=64&&a[1]<=127)&&!(a[0]===172&&a[1]>=16&&a[1]<=31)&&!(a[0]===192&&(a[1]===168||a[1]===0))&&!(a[0]===198&&(a[1]===18||a[1]===19));}
function publicURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||net.isIP(u.hostname)||/\.(?:local|localhost|internal|lan|onion)$/i.test(u.hostname))throw Error('Доступны только публичные HTTPS-страницы.');u.hash='';return u;}
module.exports={publicIP,publicURL};
