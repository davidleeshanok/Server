var videoReader = require('./MJPEGVideo'),
    rtp = require('./RTP'),
    crypto = require('crypto');

var timerInterval = 60;

var sessionNumber = Math.floor(1000 * Math.random()); /* any random number */
var nickNames = {},
keys = {},
iv = {},
macKeys = {},
macIv = {},
sessions = {},
videos = {},
RTPPorts = {},
clientIP = {},
frameIndex = {},
clientTimer = {},
videoFrameNo = {};

module.exports = {

    handleClientJoining: function(sock) {
        sessionNumber = assignGuestName(sock, sessionNumber, nickNames);
        console.log('\nClient (' + sock.id + '): ' + nickNames[sock.id] + ' is connected');
        sock.on('data', function(data) {
            handleClientRequests(data, sock); //read client requests and respond
        });

        sock.on('close', function() {
            handleClientLeaving(sock);
        });
    }
};

//-----------------------------------------------------
// Parse client RTSP Request, 
// Perform client request, and
// return a propoer RTSP response
//-----------------------------------------------------
function handleClientRequests(data, sock) {
    var response = 'RTSP/1.0 200 OK\n';
    var seq;
    console.log('\n' + nickNames[sock.id] + ' requests: \n' + data);
    if (/^SETUP/.test(data)) {
		// form a response
        seq = (data + ' ').match(/CSeq:\s(\d+)/)[1];
        response += 'CSeq: ' + seq;
		// initialize the client setting
        videos[sock.id] = (data + ' ').match(/(\w+\.mjpeg)/)[1];
        RTPPorts[sock.id] = (data + ' ').match(/client_port= (\d+)/)[1];
    }
    //Handles the key exchange via Diffie-Hellman
    else if (/^KEYEXCHANGE/.test(data)) {
        var clientSecret = (data + ' ').match(/KEYEXCHANGE:(.*)KEYEND/)[1];
        console.log("\nClient secret: " + clientSecret);

        //Use node.js crypto library to create a DiffieHellman class with generator value '2' (default) and use supplied prime
        var diffieHellman = crypto.createDiffieHellman('00e53a3f72c435febe5809c84337575a3e06a60e171f83d500014bcb4c78b1188dd99e9841e96e032ef47e6ae4ca7fa8a5b9cba362ca537c301a1b59fb3eb42c47056fdecb3b0fabcbb49414365bf0367ab8669904ff44762a97e875594865d1fb', ['hex']);
        diffieHellman.generateKeys('hex');

        //Take the clientSecret and compute the sharedSecret (the key)
        try {
        var sharedSecret = diffieHellman.computeSecret(clientSecret, 'hex');
        }
        catch(ex) {
            console.log("\nError generating keys. Retrying...");
            console.log(ex);
            //Send message to client to retry key exchange
            sock.write("RETRYKEYEXCHANGE");
            return;
        }
        console.log("\nKeys exchanged successfully.");

        //Create the serverSecret and send to the client
        var serverSecret = diffieHellman.getPublicKey('hex');
        console.log("\nServer secret: " + serverSecret);
        sock.write(serverSecret);

        //Divide the shared secret into the symmetric key, IV, MAC key, and MAC IV
        keys[sock.id] = new Buffer(32);
        iv[sock.id] = new Buffer(16);
        macKeys[sock.id] = new Buffer(32);
        macIv[sock.id] = new Buffer(16);
        sharedSecret.copy(keys[sock.id], 0, 0, 32);
        sharedSecret.copy(iv[sock.id], 0, 32, 48);
        sharedSecret.copy(macKeys[sock.id], 0, 48, 80);
        sharedSecret.copy(macIv[sock.id], 0, 80, 96);

        return;
    }
    else if (/^PLAY/.test(data)) {
		// form a response
        seq = (data + ' ').match(/CSeq:\s(\d+)/)[1];
        response += 'CSeq: ' + seq;
		//start timer to start or resume the video playout
        clientTimer[sock.id] = setInterval(Server_Time_Handler, timerInterval, sock);
    }
    else if (/^PAUSE/.test(data)) {
		// form a response
        seq = (data + ' ').match(/CSeq:\s(\d+)/)[1];
        response += 'CSeq: ' + seq;
		//stop timer to pause the current playout  
        clearInterval(clientTimer[sock.id]);
        delete clientTimer[sock.id];
    }
    else if (/^TEARDOWN/.test(data)) {
		// form a response
        seq = (data + ' ').match(/CSeq:\s(\d+)/)[1];
        response += 'CSeq: ' + seq;
		//stop timer to pause the current playout and reset the current connection   
        clearInterval(clientTimer[sock.id]);

        delete clientTimer[sock.id];
        rtp.close();

        frameIndex[sock.id] = 0;
        videoFrameNo[sock.id] = 0;
        delete videos[sock.id];
        delete RTPPorts[sock.id];
    }
    else console.log('other');

    sock.write('RTSP/1.0 200 OK\nCSeq: ' + seq + '\nSession: ' + sessions[sock.id]);
}

function handleClientLeaving(sock) {
    console.log(nickNames[sock.id] + ' closed the connection');
    clearInterval(clientTimer[sock.id]);
    delete sessions[sock.id];
    delete frameIndex[sock.id];
    delete nickNames[sock.id];
    delete videos[sock.id];
    delete RTPPorts[sock.id];
    delete keys[sock.id];
    delete iv[sock.id];
    delete macKeys[sock.id];
    delete macIv[sock.id];
}

//----------------------------------------------
// Maintain specific information for each client
//
// Note that, if we need to create an object peroperties 
// and assign then values dynamically we do the following.
//    let create an object persons with name, age perporties
//    instead of writing 
//      var person = {"name" : "Johon Smith", "age" : 30}
//    we write
//      var person = {};
//      person["name"] = "Johon Smith";
//      person["age"] = 30;
//----------------------------------------------
function assignGuestName(sock, sessionNumber, nickNames) {
    var name = 'Guest ' + sessionNumber;
    sock.id = sock.remoteAddress + ':' + sock.remotePort;
    nickNames[sock.id] = name;  
    sessions[sock.id] = sessionNumber;
    frameIndex[sock.id] = 0;
    videoFrameNo[sock.id] = 0;
    clientIP[sock.id] = sock.remoteAddress;

    return Math.floor(1000 * Math.random());
}


//------------------------------------
//Handler for timer
//------------------------------------
function Server_Time_Handler(sock) {
    var nextFrame = videoReader.getnextframe(videos[sock.id], frameIndex[sock.id]);
    frameIndex[sock.id] = nextFrame.p;
    var image_length = nextFrame.l;
    videoFrameNo[sock.id]++;
    
    if (nextFrame.p > 0) {

        rtp.MediaType = 26;
        rtp.FrameNo = videoFrameNo[sock.id];
        rtp.TimeStamp = videoFrameNo[sock.id] * timerInterval;

        //Encrypt the payload of the RTP packet
        //Create a cipher using AES-256-CBC
        cipher = crypto.createCipheriv('aes-256-cbc', keys[sock.id], iv[sock.id]);
        cipher.setAutoPadding(true);

        var temp = new Buffer(62000);
        nextFrame.f.copy(temp);

        var buf = cipher.update(temp, undefined, 'hex');
        buf += cipher.final('hex');

        var payloadBuffer = new Buffer(buf, 'hex');
        console.log(payloadBuffer.length);

        rtp.Payload = payloadBuffer;
        rtp.PayloadLength = payloadBuffer.length;
        rtp.init('127.0.0.1', 0);
        //send the packet as a DatagramPacket over the UDP socket 
        rtp.SendRTPPacketTo(clientIP[sock.id], RTPPorts[sock.id]);
    }
    else {
        //  StopTimer();
        clearInterval(clientTimer[sock.id]);

        delete clientTimer[sock.id];
        rtp.close();

        frameIndex[sock.id] = 0;
        videoFrameNo[sock.id] = 0;
        delete videos[sock.id];
        delete RTPPorts[sock.id];

    }


}