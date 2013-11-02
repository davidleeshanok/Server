 var RTPpacket = require('./RTPpacket'),
     udp = require('dgram');

 module.exports = {
     rtp_packet: null,
     RTPsocket: null, //UDP socket to be used to send RTP packets
     IP: null,
     port: null,

     MediaType: null,
     FrameNo: null,
     TimeStamp: null,
     Payload: null,
     PayloadLength: null,

     init: function(IP, port) {
         this.IP = IP;
         this.port = port;
         this.RTPsocket = udp.createSocket('udp4');
         this.rtp_packet = RTPpacket;
         this.rtp_packet.init(this.MediaType, this.FrameNo, this.TimeStamp, this.Payload, this.PayloadLength);
     },

     //Build and send the packet as a DatagramPacket over the UDP socket 
     SendRTPPacketTo: function(clientIP, clientPort) {
         this.RTPsocket.send(this.rtp_packet.getpacket(), 0, this.rtp_packet.getlength(), clientPort, clientIP);
     },

     close: function() {
         this.RTPsocket.close();
     }
 };