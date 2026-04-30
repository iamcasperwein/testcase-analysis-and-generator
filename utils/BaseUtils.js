const base64Decoder = (encodedString) =>  {
    return Buffer.from(encodedString, 'base64').toString('utf-8');
}

const base64Encoder = (str) =>  {
    return Buffer.from(str, 'utf-8').toString('base64');
}
const tokn = base64Encoder("casper.weinberger@traveloka.com:K6FtGK.JGNni98abB1IM-Ki0ZY6RnKsePluIEezDh");
console.log("encode: " , tokn)
console.log("decoded: " , base64Decoder("cmVubmEucmFtYWRoYW5pQHRyYXZlbG9rYS5jb206eEJxMVczTklhd0Rwb1pIY2hlNDItZGd4ZzBIaERFNDlBV2FmWXhYSC8="))
console.log("decoded: " , base64Decoder(tokn))


// module.exports = { base64Decoder, base64Encoder };