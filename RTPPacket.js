//size of the RTP header:
var HEADER_SIZE = 12;
var HMAC_SIZE = 16;

//Fields that compose the RTP header
var Version,
Padding,
Extension,
CC,
Marker,
PayloadType,
SequenceNumber,
TimeStamp,
Ssrc;

module.exports = {
    header: '', //Bitstream of the RTP header
    payloadSize: 0, //size of the RTP payload
    payload: '', //Bitstream of the RTP payload
    hmac: '',

    init: function(PType, FrameNum, Time, data, data_length) {
        //fill by default header fields:
        Version = 2;
        Padding = 0;
        Extension = 0;
        CC = 0;
        Marker = 0;
        Ssrc = 0;

        //fill changing header fields:
        SequenceNumber = FrameNum;
        //  SequenceNumber = Math.floor(1000 * Math.random()); // sequence number. SHOULD be random (16 bits)
        TimeStamp = Time;
        PayloadType = PType;

        //build the header bistream:
        //--------------------------
        this.header = new Buffer(HEADER_SIZE);

        //fill the header array of byte with RTP header fields
        this.header[0] = ((Version << 6) | (Padding << 5) | (Extension << 4) | CC);
        this.header[1] = ((Marker << 7) | PayloadType);
        this.header[2] = (SequenceNumber >> 8);
        this.header[3] = (SequenceNumber);
        for (var Ti = 0; Ti < 4; Ti++)
        this.header[7 - Ti] = (TimeStamp >> (8 * Ti));
        for (var Si = 0; Si < 4; Si++)
        this.header[11 - Si] = (Ssrc >> (8 * Si));


        //fill the payload bitstream:
        //--------------------------
        this.payload_size = data_length;
        this.payload = new Buffer(data_length);

        //fill payload array of byte from data (given in parameter of the constructor)
        //......
        for (var Pi = 0; Pi < data_length; Pi++)
        this.payload[Pi] = data[Pi];
    },
    //--------------------------
    //getlength: return the total length of the RTP packet
    //--------------------------
    getlength: function() {
        return (this.payload_size + HEADER_SIZE + HMAC_SIZE);
    },

    //--------------------------
    //getpacket: returns the entire packet
    //--------------------------
    getpacket: function() {
        var packet = new Buffer(this.payload_size + HEADER_SIZE);
        //construct the packet = header + payload
        for (var Hi = 0; Hi < HEADER_SIZE; Hi++)
        packet[Hi] = this.header[Hi];
        for (var Pi = 0; Pi < this.payload_size; Pi++)
        packet[Pi + HEADER_SIZE] = this.payload[Pi];

        return packet;
    },

    gethmacpacket: function() {
        var hmacPacket = new Buffer(this.payload_size + HEADER_SIZE + HMAC_SIZE);

        for (var Hi = 0; Hi < HEADER_SIZE; Hi++)
            hmacPacket[Hi] = this.header[Hi];
        for (var Pi = 0; Pi < this.payload_size; Pi++)
            hmacPacket[Pi + HEADER_SIZE] = this.payload[Pi];
        for (var Mi = 0; Mi < HMAC_SIZE; Mi++)
            hmacPacket[Mi + HEADER_SIZE + this.payload_size] = this.hmac[Mi];

        return hmacPacket;
    },

    sethmac: function(hmac) {
        this.hmac = hmac;
    }
};