/*
 *   Take the POST data and save it to a log
 */


http = require('http');
fs = require('fs');


/*
 *           ----- PARAMETERS -----
 */

// largest acceptable body in characters
MAXBODY = 20000;

port = 8888;

// set host to 127.0.0.1 for local connections
//  and null for external
host = null;

// full path of the file to log to
logfile = 'pbit.log';
logOptions = {flags: 'a', encoding: 'utf8', mode: 0o640, autoClose: true};

// the path to the configuration file
configPath = './fslogger.conf';


// message for a GET
e200 = '' +
  '<html><head><title>Not accepted</title></head>' +
  '<body><h2>Not accepted</h2></body></html>';
  
// stream to log file
logs = null;

/*
 *           ----- FUNCTIONS -----
 */

/**
  get timezone string

  offset: the timezone offset in minutes
  =>: a formatted string
*/
timezoneStrings = null;
tzString = function (off) {
  var r;
  
  try {
    r = ' ' + timezoneStrings[off];
  } catch (e) {
    r = '';
  }
  
  return r
}

/**
  Format an epoch

  epoch: the epoch in milliseconds
  =>: a formatted string
*/
formatEpoch = function (epoch) {
    
    var date = new Date(epoch);
    var day = date.getDate();
    var hour = date.getHours();
    var min = date.getMinutes();
    var sec = date.getSeconds();
    var milli = date.getMilliseconds();

    var mns = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
                    'Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
    var ds = (day < 10 ? "0" : "") + day;
    var hs = (hour < 10 ? "0" : "") + hour;
    var ms = (min < 10 ? "0" : "") + min;
    var ss = (sec < 10 ? "0" : "") + sec;
    var mms = (milli > 99 ? "" : (milli > 9 ? '0' : '00')) + milli;

    var str = mns + ' ' + ds + ' ' + date.getFullYear() + ' ' +  hs + 
                  ":" + ms + ":" + ss + '.' + mms + 
                  tzString(date.getTimezoneOffset());

    return str;
}

/**
  Write a message to the server log

  message: string to write
  => : undefined
*/
serverLog = function(message) {
  var ts = new Date().toISOString();
  
  console.log(ts + '|' + message);
}

/**
  Follow the HP ArcSight CEF encoding rules

  data: a primitive Javascript type to encode
  => : a CEF encoded string
*/
cefencode = function(data) {
  var s = '';
  switch (typeof(data)) {
    case 'undefined':
      s = 'undefined';
      break;
    case 'number':
    case 'boolean':
    case 'object':
      s = data.toString();
      break;
    case 'string':
      s = data;
      s = s.replace(/\\/g, '\\\\');
      s = s.replace(/=/g, '\\=');
      s = s.replace(/\n/g, '\\n');
      s = s.replace(/\r/g, '\\r');
      break;
    default:
      s = 'unrecognized data';
  }
  
  return s;
}

/** 
    Convert a JSON string to CEF format and write it to a log stream

    logs: a WriteStream, the log to write the information in jsonstr
    jsonstr: a string serialized JSON
    => : undefined
*/
logger = function(logs, jsonstr) {
  var data;
  var badInputQ;
  var cef;
  var message = null;
  
  badInputQ = false;
  try {
    data = JSON.parse(jsonstr);
  } catch (e) {
    // did not parse correctly
    serverLog("json parse error")
    badInputQ = true;
  }
  
  if (! badInputQ) {
    // figure out event class
    try {
      cef = formatEpoch(data.run_start);
      cef += ' ' + data.node;
      cef += ' CEF:0|PermissionBit|DeepXi|1.0';
      
      cef += '|1|Sense detection';
  
      // severity
      cef += '|' + Math.round(10 * data.score);
  
      // extensions
      cef += '|deviceExternalId=' + cefencode(data.node);
  
      message = 'alert: ' + data.alert.toString();
      message += ' score: ' + data.score.toString();
      message += ' process_summary: ' + data.process_summary;
  
      cef += ' message=' + cefencode(message);
  
      logs.write(cef + '\n', 'utf8', () => {} );
    } catch (err) {
      serverLog("Could not write messgage: " + 
                 jsonstr.substring(0, 60) + " ...");
    }
    
  }
}

/**
  Read configuration file

  Different search for it are implemented here
*/
readConfig = function () {
  var cf, goodQ, config;
    
  // read the contents of the configuration
  try {
    cf = fs.readFileSync(
      configPath, 
      {'encoding': 'ascii'}
    );
  } catch (e) {
    if (e.code == 'ENOENT') {
      console.error("Using defaults. Cannot read " + e.path);
    } else {
      console.error("Cannot read conf" + e.stack);
      process.exit(3);
    }
  }
  
  // parse the configuration file
  goodQ = true;
  try {
    config = JSON.parse(cf);
  } catch (e) {
    // did not parse correctly
    serverLog('Configuration file parse error for ' + configPath);
    goodQ = false;
  }
  
  if (goodQ) {
    port = config.port;
    host = typeof(config.host) === 'undefined' ? null : config.host ;
    logfile = config.logfile;
    timezoneStrings = typeof(config.timezoneStrings) === 'undefined' ?
                            null : config.timezoneStrings;
  }
  
}

/*
 *
 *             MAIN
 *
 */

// read configuration
readConfig();

// open log file
logs = fs.createWriteStream(logfile,logOptions);

logs.on('error', (err) => {
  // serverLog("Could not write to " + logfile);
  // until we learn if this happens, crash
  console.error(err);
  process.exit(4);
});

// re-open log file for log rotation
process.on('SIGPIPE', () => {
  logs.end();
  logs = fs.createWriteStream(logfile, logOptions);
});

// die on exceptions
process.on('uncaughtException', (err) => {
  if (err.errno === 'EACCES') {
    serverLog('permission denied');
    console.error('Exiting: permission denied.  Check port number?');
    process.exit(2);
  } else {
    serverLog('unhandled exception');
    console.error('Exiting: unhandled exception ' + err.stack);
    process.exit(1);
  }
  
});


// create a server 
server = http.createServer( function(req, res) {

    switch (req.method) {
      case 'POST':
        var body = ''; 
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            if (body.length < MAXBODY) {
              logger(logs, body);
            } else {
              serverLog('Received input larger than ' + MAXBODY);
            }
        });
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('ok');
        break;
        
      case 'GET':
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(e200);
        break;
        
      case 'HEAD':
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end();
        break;
        
      default:
        serverLog('Unrecognized method');
        res.writeHead(405, {'Content-Type': 'text/plain'});
        res.end('error');
    }

});

// start server
if (host === null ) {
  // we are listening to the world
  server.listen(port);
  console.error('Listening on port ' + port);
} else {
  // listen on some other interface
  server.listen(port, host);  
  console.error('Listening at http://' + host + ':' + port);
}
