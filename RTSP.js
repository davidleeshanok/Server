var videoReader = require('./MJPEGVideo'),
    rtp = require('./RTP');

var timerInterval = 60;

var sessionNumber = Math.floor(1000 * Math.random()); /* any random number */
var nickNames = {},
keys = {},
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
        rtp.Payload = nextFrame.f;
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