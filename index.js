'use strict';

const jimp = require("jimp");
const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const uuidV1 = require('uuid/v1');

const recognize = (buffer, callback, table, uuid) => {
    var docClient = new AWS.DynamoDB.DocumentClient();

    var params = {
        Image: {
            Bytes: buffer
        },
        MaxLabels: 10,
        MinConfidence: 60
    };

    rekognition.detectLabels(params).promise().then(function (data) {
        var dynamoParams = {
            TableName: table,
            Item:{
                "id": uuid,
                "meta": data.Labels
            }
        };

        docClient.put(dynamoParams, function(err, data) {
        if (err) {
            console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Added item:", JSON.stringify(data, null, 2));
            greyscaleImage(buffer, table, uuid);
        }
        });

    }).catch(function (err) {
        callback(err);
    });
};

const greyscaleImage = (buffer, table, uuid) => {
  jimp.read(buffer).then(function (img) {
    var grey = img.greyscale();
    grey.getBuffer( jimp.MIME_PNG, function(err, image) {
      s3upload(image, table, uuid);
    });
  }).catch(function (err) {
      console.error(err);
  });
};


const s3upload = (buffer, table, uuid) => {
    var s3 = new AWS.S3();

    const s3Params = {
      Bucket: 'example-bucket-1',
      Key: uuid.concat('.png'),
      Body: buffer,
      ACL: 'public-read',
      ContentType: 'image/png'
    };

    s3.putObject(s3Params, function(err, data) {
      if (err) console.log(err, err.stack);
      else
      {
          updateDB(table, uuid);
      }
    });
};

const updateDB = (table, uuid) => {
    var s3 = new AWS.S3();

    var docClient = new AWS.DynamoDB.DocumentClient();
    var key = uuid.concat('.png')

    var urlParams = { Bucket: 'example-bucket-1', Key: key };
    s3.getSignedUrl('getObject', urlParams, function(err, url){
        var dynamoParams = {
            TableName: table,
            Key:{
                "id": uuid
            },
            UpdateExpression: "set url = :url",
            ExpressionAttributeValues:{
                ":url": url,
            },
            ReturnValues:"UPDATED_NEW"
        };

        docClient.update(dynamoParams, function(err, data) {
            if (err) {
                console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                console.log("Added item:", JSON.stringify(data, null, 2));
            }
        });
    });
};

const process_image = (req, callback) => {
    var buffer = new Buffer(req.base64Image, 'base64');

    var docClient = new AWS.DynamoDB.DocumentClient();
    var dynamodb = new AWS.DynamoDB();
    var table = "Images";
    var uuid = uuidV1();
    var s3 = new AWS.S3();

    recognize(buffer, callback, table, uuid);
};

exports.handler = (event, context, callback) => {
    const req = event;

    process_image(req, callback);
};
