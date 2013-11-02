var fs = require('fs');

//read current frame length
var getFrameSize = function(filename, position) {
    var fd = fs.openSync('../Videos/' + filename, 'r');
    var buf = new Buffer(5);
    fs.readSync(fd, buf, 0, buf.length, position);

    var bytesRead = fs.readSync(fd, buf, 0, buf.length, position);
    if (bytesRead === 0) {
        fs.closeSync(fd);
        return -1;
    }
    else {
        fs.closeSync(fd);
        return parseInt(buf, 10);
    }
};

module.exports = {
    // returns the next frame as an array of byte and the size of the frame
    getnextframe: function(filename, position) {
        var fd = fs.openSync('../Videos/' + filename, 'r');
        var frameSize = getFrameSize(filename, position);
        if (frameSize === -1) {
            fs.closeSync(fd);
            return {
                f: '',
                p: -1,
                l: -1
            };
        }
        else {
            var frame = new Buffer(frameSize);
            position += 5;
            var bytesRead = fs.readSync(fd, frame, 0, frameSize, position);
            if (bytesRead === 0) {
                fs.closeSync(fd);
                return {
                    f: '',
                    p: -1,
                    l: -1
                };
            }
            else {
                position += frameSize;
                fs.closeSync(fd);
                return {
                    f: frame,
                    p: position,
                    l: bytesRead
                };
            }
        }
    }
};
