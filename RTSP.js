var videoReader = require('./MJPEGVideo'),
    rtp = require('./RTP'),
    crypto = require('crypto');

var timerInterval = 60;

var sessionNumber = Math.floor(1000 * Math.random()); /* any random number */
var nickNames = {},
keys = {},
iv = {},
macKeys = {};
macIv = {};
cipher = {},
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

        //Create the serverSecret and send to the client
        var serverSecret = diffieHellman.generateKeys(['hex'])
        console.log("\nServer secret: " + serverSecret);
        sock.write(serverSecret);

        //Take the clientSecret and compute the sharedSecret (the key)
        try {
        var sharedSecret = diffieHellman.computeSecret(clientSecret, ['hex'], ['hex']);
        console.log("\nShared secret: " + sharedSecret);

/*
        //Convert to binary
        var sharedSecretBinary = convertHexToBinary(sharedSecret);

        //Divide the shared secret into the symmetric key, IV, MAC key, and MAC IV
        keys[sock.id] = sharedSecretBinary.substring(0, 256);
        iv[sock.id] = sharedSecretBinary.substring(257, 289);
        macKeys[sock.id] = sharedSecretBinary.substring(386, 642);
        macIv[sock.id] = sharedSecretBinary.substring(643);

        console.log ("\n Key: " +
            keys[sock.id] + "\n IV: " +
            iv[sock.id]  + "\n MAC Key: " +
            macKeys[sock.id] + "\n MAC IV: " +
            macIv[sock.id]
            );
*/
        }
        catch(ex) {
            console.log("\nSomething went wrong computing the shared secret.\n");
            console.log(ex);
        }


        //Divide the shared secret into the symmetric key, IV, MAC key, and MAC IV
        keys[sock.id] = new Buffer(32);
        iv[sock.id] = new Buffer(16);
        macKeys[sock.id] = new Buffer(32);
        macIv[sock.id] = new Buffer(16);

        keys[sock.id].write(sharedSecret, 0, 32, 'hex');
        iv[sock.id].write(sharedSecret, 32, 16, 'hex');
        macKeys[sock.id].write(sharedSecret, 48, 32, 'hex')
        macIv[sock.id].write(sharedSecret, 80, 'hex');



        //Create a cipher using AES-128-CBC
        var cipher = crypto.createCipheriv('aes-256-cbc', keys[sock.id], iv[sock.id]);
        this.cipher[sock.id] = cipher;

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
        rtp.Payload = cipher[sock.id].update(nextFrame.f, [binary], [binary]);
        rtp.PayloadLength = image_length;
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


function convertHexToBinary(hex) {
    var binary = [];

    for (var i = 0; i < hex.length; i++) {

        if(hex[i] == 0) {
            binary.push("0000")
        }
        else if(hex[i] == 1) {
            binary.push("0001");
        }
        else if(hex[i] == 2) {
            binary.push("0010");
        }
        else if(hex[i] == 3) {
            binary.push("0011");
        }
        else if(hex[i] == 4) {
            binary.push("0100");
        }
        else if(hex[i] == 5) {
            binary.push("0101");
        }
        else if(hex[i] == 6) {
            binary.push("0110");
        }
        else if(hex[i] == 7) {
            binary.push("0111");
        }
        else if(hex[i] == 8) {
            binary.push("1000");
        }
        else if(hex[i] == 9) {
            binary.push("1001");
        }
        else if(hex[i] === "a") {
            binary.push("1010");
        }
        else if(hex[i] === "b") {
            binary.push("1011");
        }
        else if(hex[i] === "c") {
            binary.push("1100");
        }
        else if(hex[i] === "d") {
            binary.push("1101");
        }
        else if(hex[i] === "e") {
            binary.push("1110");
        }
        else if(hex[i] === "f") {
            binary.push("1111");
        }
    };
    //Join array and remove leading 0s
    return binary.join('').match(/1[0,1]*/).toString();
}