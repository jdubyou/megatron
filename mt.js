var assert       			= require('assert');
var manta       			= require('manta');
var fs 	         			= require('fs');
var crypto 	     			= require('crypto');
var MemoryStream			= require('memorystream');
var path        			= require('path');
var XMLHttpRequest          = require('XMLHttpRequest').XMLHttpRequest;
var request					= require('request');
var gitio = require('gitio');
var shorturl = require('shorturl');;
var util = require('util');
var pathToFileToUpload = process.argv[2];

/**
 * Create  Manta client
 */
function createMantaClient() {
    var kid =  process.env.MANTA_KEY_ID;
    console.log( process.env.MANTA_KEY_ID);
	console.log(process.env.HOME);
	return manta.createClient({
    		sign: manta.privateKeySigner({
        				key: fs.readFileSync(process.env.HOME + "/.ssh/id_rsa", 'utf8'),
        				keyId: process.env.MANTA_KEY_ID,
        				user: process.env.MANTA_USER
    		}),
    		user: process.env.MANTA_USER,
    		url: process.env.MANTA_URL
	});
}

/**
 * Upload a file to Manta
 *
 * Parameters:
 * -client: An actual Manta Client object returned from manta.Client
 * -pathtoFile: A path to the file(s) to upload. As an example, /foo
 *  all files in /foo will be uploaded to Manta
 */
function uploadFile (client, pathToFile) {
	var mantaDirectoryToUploadTo = '/' + process.env.MANTA_USER + '/public/pictures';
	
	//Setup required headers for Manta
	var mantaOptions = {
    	copies: 3,
    	headers: {
        	'access-control-allow-origin': '*',
        	'access-control-allow-methods': 'GET'
    	},
    	type:'application/javascript'
	};
	//Open a readable string
	var readableStream = fs.createReadStream(pathToFile, {autoClose:true});
	
	//Catch any errors usually invalid names
	readableStream.on('error', function (error) {
			console.error("Caught", error);
	});
    
	//Only grab the file name at the end of a path after the last slash
    var sp = pathToFile.split("/");
	var file = sp[sp.length-1];

	//Do the work of uploading the file to Manta
	client.put(mantaDirectoryToUploadTo + '/' + file, readableStream, mantaOptions, function (err) {
    	if (err) {
    		console.error('put error--> ' + err);
    	}
    	console.log("uploading --> " + mantaDirectoryToUploadTo + '/' + file );
		convertImage(mantaDirectoryToUploadTo + '/' + file);
	});
	
}
function convertImage(image) {
	console.log("image = " + image);
    var sprintf = util.format;
	var job = {
  		name: "Convert Image",
  		phases: [ {
					type: 'map',
					exec:  sprintf("convert /manta%s %s && mput -f out.gif /jdubyou3/public/pictures", image, "out.gif"),
				}]
	};
	client.createJob(job, function onCreateJob(err, id) {
		if (err) {
			console.error("create job error = " + err);
			return;
		}
		var keys = [image]; 
		client.addJobKey(id, keys, function onAddJobKey(err, job)  {
				if (err) {
						console.error(err);
				}
		
			console.log(id);
	    	client.endJob(id, function (err) {
				if (err) {
					console.error(err);
			}	
			});
		});
	     
	});
}
function signURL(client,pathAndFile) {	
	var sig;
    var p = '/' + process.env.MANTA_USER + '/public/' +  pathAndFile;
   	var opts = {
        expires: new Date().getTime() + (3600 * 72000), // 1hr
        path: p,
        method: ['OPTIONS', 'PUT', 'GET']
    };
    client.signURL(opts, function (err, signature) {
        assert.ifError(err);
    	sig = signature;
    });
    return sig; 
}

/**
 * list objects given a Manta Path
 * Parameters:
 * -path: A path in Manta
 */
function listObjects(path) {
	var opts = {};
	client.ls('/' + process.env.MANTA_USER + path, opts, function (err, res) {
    	assert.ifError(err);
    	console.log(err);

    	res.on('object', function (obj) { 
        	console.log(obj.name);
    	});

    	res.on('directory', function (dir) {
        	console.log(dir);
    	});

    	res.once('error', function (err) {
        	console.error(err.stack);
        	process.exit(1);
    	});

    	res.once('end', function () {
        	console.log('all done');
        	process.exit();
    	});
	});
}

//Call functions to upload files
assert.ok(pathToFileToUpload);
var client = createMantaClient();
assert.ok(client);

//Read directory of files and upload to Manta
fs.readdir(pathToFileToUpload, function (err, list) {
    assert.ok(list);
    if (err) {
     	console.error("err = " + err);
      return action(err);
    }
    var rpath = fs.realpathSync(pathToFileToUpload);
    console.log("rpath = " + rpath);
	list.forEach(function (file) {
			console.log("file = " + file);
      shorturl("https://us-east.manta.joyent.com" + signURL(client,file), function(result) {
      	console.log(result);
	  });
	  uploadFile (client, rpath + '/' + file);
	});
});
