var Imap = require('imap'),
    inspect = require('util').inspect; ''

const simpleParser = require('mailparser').simpleParser;
const fs = require('fs');
const { Base64Decode } = require('base64-stream');

const axios = require("axios");

var imap = new Imap({
    user: 'vb@gmail.com',
    password: '',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
}

function findAttachmentParts(struct, attachments) {
    console.log('%%%%%%%%%%%%%%%%% struct', struct);
    attachments = attachments || [];
    for (var i = 0, len = struct.length, r; i < len; ++i) {
        if (Array.isArray(struct[i])) {
            findAttachmentParts(struct[i], attachments);
        } else {
            if (struct[i].disposition && ['INLINE', 'ATTACHMENT', 'FROM'].indexOf(struct[i].disposition.type) > -1) {
                attachments.push(struct[i]);
            }
        }
    }
    return attachments;
}

function buildAttMessageFunction(attachment) {
    var filename = attachment.params.name;
    var encoding = attachment.encoding;

    return function (msg, seqno) {
        var prefix = '(#' + seqno + ') ';
        msg.on('body', function (stream, info) {
            //Create a read stream so that we can stream the attachment to file;
            console.log(prefix + 'Streaming this attachment to file', filename, info);
            var writeStream = fs.createReadStream(filename); // we can use createReadScrean

            if (encoding === 'BASE64') {
                //the stream is base64 encoded, so here the stream is decode on the fly and piped to the write stream (file)
                const request_config = {
                    method: "post",
                    url: "https://test/chat/api/v1/rooms.upload/8uihiuhiuhui",
                    headers: {
                        "Content-Type": "multipart/form-data",
                        "X-Auth-Token": "",
                        "X-User-Id": ""
                    },
                    data: {
                        file: writeStream,
                        description: "description",
                        msg: 'pdf'
                    }
                };

                axios(request_config)
                    .then(res => {
                        console.log('request response == ', res);

                    }).catch(err => {
                        console.log("error === ", err);
                    })
            } else {
                stream.pipe(writeStream);
            }
        });

        msg.once('end', function () {
            console.log(prefix + 'Finished attachment %s', filename);
        });
    };
}

imap.once("ready", () => {
    openInbox((err, box) => {

        imap.on('mail', (countNewEmails) => {
            console.log('received new email ', countNewEmails);

            var f = imap.seq.fetch(box.messages.total + ':*', { bodies: ['HEADER.FIELDS (FROM)', 'TEXT'], struct: true });
            f.on('message', function (msg, seqno) {
                var prefix = '(#' + seqno + ') ';
                msg.on('data', (data) => {
                    console.log(data.filename);
                    console.log(data.contentType);
                    console.log("data type", data.type);
                });


                msg.on('body', function (stream, info) { // HERE
                    simpleParser(stream, (err, mail) => { //use this
                        const headers = mail.headers.get('<header key>') //retreives header content by key (for example 'from' or 'to')

                        console.log('mail', mail);
                        console.log('mail.text ', mail.text);
                        console.log('headers = ', headers);
                    });

                    if (info.which === 'TEXT')
                        console.log(prefix + 'Body [%s] found, %d total bytes', inspect(info.which), info.size);
                    var buffer = '', count = 0;
                    stream.on('data', function (chunk) {
                        count += chunk.length;
                        buffer += chunk.toString('utf8');
                        if (info.which === 'TEXT')
                            console.log(prefix + 'Body [%s] (%d/%d)', inspect(info.which), count, info.size);
                    });
                    stream.once('end', function () {
                        if (info.which !== 'TEXT')
                            console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
                        else
                            console.log(prefix + 'Body [%s] Finished', inspect(info.which));
                    });
                });

                msg.once('attributes', function (attrs) {

                    var attachments = findAttachmentParts(attrs.struct);
                    console.log(prefix + 'Has attachments: %d', attachments.length);
                    console.log("#####################attrs ==== ", attrs);
                    for (var i = 0, len = attachments.length; i < len; ++i) {
                        var attachment = attachments[i];
                        console.log('át@@@@@ atach == ', attachment);
                        console.log(prefix + 'Fetching attachment %s', attachment.params.name);
                        var f = imap.fetch(attrs.uid, {
                            bodies: [attachment.partID],
                            struct: true
                        });
                        
                        //build function to process attachment message
                        f.on('message', buildAttMessageFunction(attachment));
                    }
                });
                msg.once('end', function () {
                    console.log(prefix + 'Finished');
                });
            });
            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });
            f.once('end', function () {
                console.log('Done fetching all messages!');
                // imap.end();
            });



        });

    });

});
imap.connect();