'use strict';

const jimp = require('jimp');
const AWS = require('aws-sdk');
const uuidV1 = require('uuid/v1');

const rekognition = new AWS.Rekognition();
const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient();

const recognize = (buffer, table, uuid, callback) => {
    const params = {
        Image: {
            Bytes: buffer,
        },
        MaxLabels: 10,
        MinConfidence: 60,
    };

    rekognition.detectLabels(params).promise().then((data) => {
        const dynamoParams = {
            TableName: table,
            Item: {
                id: uuid,
                meta: data.Labels,
            },
        };

        docClient.put(dynamoParams).promise().then((data) => {
            console.log('Added item: ', JSON.stringify(data, null, 2));
            greyscaleImage(buffer, table, uuid);
        }).catch((err) => {
            console.error('Unable to add item. Error JSON: ', JSON.stringify(err, null, 2));
            callback(err);
        });
    }).catch((err) => {
        callback(err);
    });
};

const greyscaleImage = (buffer, table, uuid) => {
    jimp.read(buffer).then((img) => {
        const grey = img.greyscale();
        grey.getBuffer(jimp.MIME_PNG, (err, image) => {
            s3upload(image, table, uuid);
        });
    }).catch((err) => {
        console.error(err);
    });
};


const s3upload = (buffer, table, uuid) => {
    const s3Params = {
        Bucket: 'example-bucket-1',
        Key: uuid.concat('.png'),
        Body: buffer,
        ACL: 'public-read',
        ContentType: 'image/png',
    };

    s3.putObject(s3Params).promise().then((data) => {
        updateDB(table, uuid);
    }).catch((error) => {
        console.log(err, err.stack);
    });
};

const updateDB = (table, uuid) => {
    const key = uuid.concat('.png')

    const urlParams = {
        Bucket: 'example-bucket-1',
        Key: key,
    };

    s3.getSignedUrl('getObject', urlParams, function(err, url) {
        const dynamoParams = {
            TableName: table,
            Key: {
                id: uuid,
            },
            UpdateExpression: 'set url = :url',
            ExpressionAttributeValues: {
                ':url': url,
            },
            ReturnValues: 'UPDATED_NEW',
        };

        docClient.update(dynamoParams).promise().then((data) => {
            console.log('Added item: ', JSON.stringify(data, null, 2));
        }).catch((error) => {
            console.error('Unable to add item. Error JSON: ', JSON.stringify(err, null, 2));
        });
    });
};

const processImage = (req, callback) => {
    const buffer = new Buffer(req.base64Image, 'base64');
    const table = 'Images';
    const uuid = uuidV1();

    recognize(buffer, table, uuid, callback);
};

exports.handler = (event, context, callback) => {
    const req = event;

    processImage(req, callback);
};
