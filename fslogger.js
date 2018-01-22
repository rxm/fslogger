/*
 *   Take the POST data and save it to a log
 */

'use strict';

var http = require('http');
var fs = require('fs');
var process = require('process');


/*
 *           ----- DEFAULT PARAMETERS -----
 */

// largest acceptable body in characters
var MAXBODY = 20000;

var port = 8888;

// set host to 127.0.0.1 for local connections
//  and null for external
var host = null;

// full path of the file to log to
var logfile = 'pbit.log';
var logOptions = {flags: 'a', encoding: 'utf8', mode: 0o640, autoClose: true};

// the path to the configuration file
var configPath = './fslogger.conf';


// message for a GET
var e200 = '' +
  '<html><head><title>Not accepted</title></head>' +
  '<body><h2>Not accepted</h2></body></html>';
  
// stream to log file
var logs = null;


// funtion that creates output
var logger = function ( ) {};

/*
 *           ----- FUNCTIONS -----
 */

/**
  get timezone string

  offset: the timezone offset in minutes
  =>: a formatted string
*/
var timezoneStrings = null;
function tzString (off) {
  var r, tzs;
  
  if ( off == 0 ) {
    tzs = 'UTC'
  } else {
    tzs = timezoneStrings[off];
    if (tzs === undefined ) {
      tzs = '';
    }
  }
  
  try {
    r = ' ' + tzs;
  } catch (e) {
    r = '';
  }
  
  return r;
}

/**
  Format an epoch

  epoch: the epoch in milliseconds
  =>: a formatted string
*/
function formatEpoch (epoch) {
    
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
function serverLog (message) {
  var ts = new Date().toISOString();
  
  console.log(ts + '|' + message);
}

/**
  Follow the HP ArcSight CEF encoding rules

  data: a primitive Javascript type to encode
  => : a CEF encoded string
*/
function cefencode (data) {
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
  
  // no leading spaces
  s = s.replace(/^ +/, '');
  
  return s;
}

/**

*/
function formatForCEF(data) {
  var cef, s, sev, ex, regex, match;
    
  cef = formatEpoch(data.run_start);
  cef += ' ' + data.node;
  cef += ' CEF:0|PermissionBit|DeepXi|1.0';
  
  // device event class id
  if (typeof(data.family.uuid) == 'string') {
    cef += '|' + data.family.uuid;
  } else {
    cef += '|Null Event';
  }
  
  // device event name
  switch (data.prob_type) {
    case 'sensing': cef += '|Sensing Detection'; break;
    case 'hunting': cef += '|Hunting Detection'; break;
    case 'imputed': cef += '|Imputed Detection'; break;
    default: cef += '|Information Event';
  }
  
  // severity
  s = data.score;
  if (s>=1.) { s -= 0.000001; }
  if (s<0.0) { s = 0.0; }
  
  if (data.alert) {
    sev = Math.floor(2*s) + 9;
    if (data.ignore) {
      sev -= 3;
    }
  } else {
    if (data.notice) {
      sev = Math.floor(8*s);
    } else {
      sev = Math.floor(7*s);
    }
  }
  
  cef += '|' + sev;

  //
  // extensions
  //
  
  cef += '|'
  
  // process summary
  cef += 'deviceCustomString1Label=processSummary';
  cef += ' deviceCustomString1=' + cefencode(data.process_summary);
  
  // score
  cef += ' deviceCustomFloatingPoint1Label=Score';
  cef += ' deviceCustomFloatingPoint1=';
  cef += Math.round(data.score * 1000)/1000;
  
  // family bundle
  if (typeof(data.family_bundle) == 'string') {
    cef += ' deviceCustomString2Label=SeenBefore';
    cef += ' deviceCustomString2=';
    
    if (data.family_bundle.startsWith('local_detections_filt')) {
      cef += 'Locally';
    } else if (data.family_bundle.startsWith('pbit_cover_base')) {
      cef += 'In malware';
    } else if (data.family_bundle.startsWith('pbit_known_programs_base')) {
      cef += 'In software';
    } else if (data.family_bundle.startsWith('nonmalware')) {
      cef += 'An inference';
    } else {
      // assume UUID
      cef += 'Only recently';
    }
  }
  
  // device action
  if (data.ignore) {
    cef += ' deviceAction=Ignore';
  } else if (data.alert) {
    cef += ' deviceAction=Alert';
  } else if (data.notice) {
    cef += ' deviceAction=Notice';
  } else {
    cef += ' deviceAction=None';
  }
  
  // do we have exemplars
  if (
    typeof(data.family.exemplars) != 'undefined' && 
    data.family.exemplars != null
  ) {
    regex = /sha256:([a-f0-9]+)/g;
    ex = 'SHA256 of malware behaving like this:';
    
    while ( (match = regex.exec(data.family.exemplars)) !== null) {
      ex += ' ' + match[1];
    }
    
    cef += ' message=' + cefencode(ex);
  }
  
  return cef;
}

/** 
    Convert a JSON string to CEF format and write it to a log stream

    logs: a WriteStream, the log to write the information in jsonstr
    jsonstr: a string serialized JSON
    => : undefined
*/
function ceflogger (logs, jsonstr) {
  var data;
  var badInputQ;
  
  badInputQ = false;
  try {
    data = JSON.parse(jsonstr);
  } catch (e) {
    // did not parse correctly
    serverLog("json parse error");
    badInputQ = true;
  }
  
  if (! badInputQ) {
    // figure out event class
    try {
      logs.write(formatForCEF(data) + '\n', 'utf8', () => {} );
    } catch (err) {
      serverLog("Could not write message: " + 
         jsonstr.replace(/[ \t\n]/g, '').substring(0, 40) + 
         "... " + err);
    }
    
  }
}

/**
  Read configuration file

  Different search strategies for it are implemented here
*/
function readConfig () {
  var cf, goodQ, config, lcode;
  
  // do something to find the configuration file
    
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
  
  // read if ok
  if (goodQ) {
    
    // these have hardwired values in the code
    port = typeof(config.port) === 'undefined' ? port : config.port;
    host = typeof(config.host) === 'undefined' ? host : config.host ;
    logfile = config.logfile;
    timezoneStrings = typeof(config.timezoneStrings) === 'undefined' ?
                            null : config.timezoneStrings;
    
    // logfile
    logfile = typeof(config.logfile) === 'undefined' ? logfile : config.logfile;
    
    // deal with logger
    lcode = config.logger;
    if (typeof(lcode) === 'undefined') {
      // default logger
      logger = ceflogger;
    } else {
      lcode = lcode.toLowerCase().replace(/[ \t]+/, '');
      // let's avoid eval
      switch (lcode) {
        case 'ceflogger': logger = ceflogger; break;
        default: 
          serverLog('No logger called ' + config.logger);
          process.exit(5);
      }      
    }
    
    // done with goodQ
  }
  
}

/**
  Return a stream to send the logs to
  logfile: a string with path | stderr | stdout
  options: an object with the optons needed by createWS

  => : a stream
*/
function openLogStream(logfile, options) {
  var logs;
  
  if (logfile == 'stderr') {
    logs = process.stderr;
  } else if (logfile == 'stdout') {
    logs = process.stdout;
  } else {
    logs = fs.createWriteStream(logfile, options);
  }
  
  return logs;
}

/*
 *
 *             MAIN
 *
 */

// read configuration
readConfig();

// open log file
logs = openLogStream(logfile, logOptions);

logs.on('error', (err) => {
  // serverLog("Could not write to " + logfile);
  // until we learn if this happens, crash
  console.error(err);
  process.exit(4);
});

// re-open log file for log rotation
process.on('SIGPIPE', () => {
  if (logfile != 'stderr' && logfile != 'stdout' ) {
    logs.end();
    logs = openLogStream(logfile, logOptions);
  }
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
var server = http.createServer( function(req, res) {

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
        
        // prepare response to send later
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
  serverLog('Listening on port ' + port);
} else {
  // listen on some other interface
  server.listen(port, host);  
  serverLog('Listening at http://' + host + ':' + port);
}
