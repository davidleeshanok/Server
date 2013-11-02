var net = require('net'),
    rtsp = require('./RTSP');

var HOST = '127.0.0.1',
    PORT = 3000;

var server = net.createServer();
server.listen(PORT, HOST);

console.log('Server listening on ' + HOST + ':' + PORT);

server.on('connection', function(sock) {
    rtsp.handleClientJoining(sock); //called for each client joining

});