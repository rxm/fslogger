/*
 *   Take the POST data and save it to a log
 *
 *   Version 0.2.0 from Fri Mar 2 18:23:36 EST 2018
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

// minimal accepted data version
var DATAVER = { major: 1, minor: 2};
var MSGVER = {major: 0, minor: 0};  // should be the same as DATAVER

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

// are we debugging?
var debugQ = false;

// funtion that creates output
var logger = function ( ) {};

// in case we need high res time
const tps = process.hrtime();

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
  
  var date, day, hour, min, sec, milli, mns, ds, hs, ms, ss, mms, str;
  
  if (epoch == 0) {
    return "Jan 01 00:00:00.000 UTC 1970";
  }
    
  date = new Date(epoch);
  day = date.getDate();
  hour = date.getHours();
  min = date.getMinutes();
  sec = date.getSeconds();
  milli = date.getMilliseconds();
  
  mns = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
              'Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
  ds = (day < 10 ? "0" : "") + day;
  hs = (hour < 10 ? "0" : "") + hour;
  ms = (min < 10 ? "0" : "") + min;
  ss = (sec < 10 ? "0" : "") + sec;
  mms = (milli > 99 ? "" : (milli > 9 ? '0' : '00')) + milli;

  str = mns + ' ' + ds + ' ' + date.getFullYear() + ' ' +  hs + 
                ":" + ms + ":" + ss + '.' + mms + 
                tzString(date.getTimezoneOffset());

  return str;
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
   check that the data version format is as expected

   ({major: int, minor: int}, string) => true|false
*/
function versionOK(expected, versionString) {
  
  var va;
  
  if (expected.major == 0 && expected.minor == 0) {
    return true;
  }
  
  if (typeof(versionString) !== 'string') {
    return false;
  }
  
  va = versionString.split('.');
  
  // auto casting in action
  return (expected.major == va[0] && expected.minor <= va[1]);
}


/** 
    Convert a JSON string to CEF format and write it to a log stream

    logs: a WriteStream, the log to write the information in jsonstr
    jsonstr: a string serialized JSON
    => : undefined
*/
function ceflogger (logs, jsonstr) {
  var data, badInputQ, mt;
  
  if (debugQ) serverLog('DEBUG', "Trying to parse JSON");
  
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
      switch (data.msg_type) {
        case 'state':
          logs.write(stateToCEF(data) + '\n', 'utf8', () => {} );
          break;
        case 'heartbeat':
          logs.write(heartToCEF(data) + '\n', 'utf8', () => {} );
          break;
        case 'live_endpoint':
        case 'registration':
        case 'deregistration':
          serverLog('ERROR', 'Got info message');
          break;
        default:
          if ( typeof(data.msg_type) === 'undefined') {
            mt = 'No message type defined';
          } else {
            mt = 'Unexpexted message type ' + data.msg_type;
          }
          serverLog('ERROR', mt);
      }
    } catch (err) {
      serverLog("Could not write message: " + 
         jsonstr.replace(/[ \t\n]/g, '').substring(0, 40) + 
         "... " + err);
    }
    
  }
}
/**
  data is the JSON from pBit and cef is the log entry in CEF
*/
function stateToCEF(data) {
  var cef, s, sev, ex, regex, match, infoEventQ, machineName;
  
  cef = formatEpoch(0);
  
  if (! versionOK(DATAVER, data.json_schema_version) ) {
    serverLog('ERROR',
      'Got innapropriate version of data: ' +  data.json_schema_version);
    return cef;
  }
  
  machineName = data.node;
  if (data.ip_address != '127.0.0.1') {
    machineName = data.ip_address;
  }
  
  // common part of the format
  cef = formatEpoch(data.run_start);
  cef += ' ' + machineName;
  cef += ' CEF:0|PermissionBit|DeepXi|1.0';
  
  // device event class id
  if (typeof(data.activity.uuid) == 'string') {
    cef += '|' + data.activity.uuid;
  } else {
    cef += '|Null Event';
  }
  
  // device event name
  infoEventQ = false;
  switch (data.prob_type) {
    case 'sensing': cef += '|Sensing Detection'; break;
    case 'hunting': cef += '|Hunting Detection'; break;
    case 'imputed': cef += '|Imputed Detection'; break;
    default: 
      cef += '|Other State';
      infoEventQ = true;
      break;
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
  
  // MAC
  cef += 'dvcmac=';
  cef += (data.mac_address).match(/(..)/g).join(':');  
  
  // process summary
  cef += ' deviceCustomString1Label=processSummary';
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
    typeof(data.activity.exemplars) != 'undefined' && 
    data.activity.exemplars != null
  ) {
    regex = /sha256:([a-f0-9]+)/g;
    ex = 'SHA256 of malware behaving like this:';
    
    while ( (match = regex.exec(data.activity.exemplars)) !== null) {
      ex += ' ' + match[1];
    }
    
    cef += ' message=' + cefencode(ex);
  }
  
  return cef;
}

/**

*/
var MAXGAP = 1000*(60*60);

function heartToCEF(data) {
  var cef, machineName, score, message, serverIssueQ;
  
  cef = formatEpoch(0);
  
  serverLog('DEBUG', 'processing heartbeat');
  
  // if ( ! versionOK(DATAVER, data.json_schema_version) ) {
  if ( ! versionOK(MSGVER, data.json_schema_version) ) {
    serverLog('ERROR',
      'Got innapropriate version of data: ' +  data.json_schema_version);
    return cef;
  }

  machineName = data.serverHost;
  if (data.host != '127.0.0.1') {
    machineName = data.host;
  }
  
  // common part of the format
  cef = formatEpoch(data.current_timestamp);
  cef += ' ' + machineName;
  cef += ' CEF:0|PermissionBit|DeepXi|1.0';
  
  // event type
  cef += '|Heartbeat'
  
  //
  // score
  //
  score = 0;
  
  // has it been long since last update
  if (data.current_timestamp - data.lastUpdated > MAXGAP) {
    // been too long
    score = 5;
  } 
  if (data.licenseExpiringSoon) score = 6;
  if (data.licenseExpired) score = 7;
  
  message = '';
  if (score >= 5) {
    message = 'Please check your license. ';
  }
  
  serverIssueQ = false;
  if (!data.postgresHealth) { score += 1; serverIssueQ = true; }
  if (!data.mathLayerHealth) { score += 1; serverIssueQ = true; }
  if (!data.cassandraHealth) { score += 1; serverIssueQ = true; }
  
  if (serverIssueQ) {
    message += 'Compute server issues. '
  }
  
  cef += '|' + score;
  
  
  // extensions
  cef += '|'
  if (score == 0) {
    cef += 'message=System operation as expected';
  } else {
    cef += message;
  }

  return cef;
}
/**
  Write a message to the server log

  if only message, assume ERROR
  modes: DEBUG ERROR
  (mode, message) => : undefined
  (message) => : undefined
*/
function serverLog (x, y) {
  var mode, message, ts, now;
  
  // figure out the arguments
  if (y === undefined) {
    // called with one parameter
    message = x;
    mode = 'ERROR'
  } else {
    // called with two args
    message = y;
    mode = x;
  }
  
  switch (mode) {
    case 'DEBUG':
      if (! debugQ ) break;
      now = process.hrtime(tps);
      now[0] = now[0] % 1000;
      process.stdout.write(now[0] + '.' + now[1] + ' | ' + message + '\n');
      break;
    case 'ERROR':
      ts = new Date().toISOString();
      console.log(ts + '|' + message);
      break;
    default:
      // do nothing
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
    
    // debug flag
    debugQ = typeof(config.debug) === 'undefined' ? debugQ : config.debug;
    
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
  
  // set things up for debug
  if (debugQ) {
    logfile = 'stdout';
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
logs = openLogStream(logfile, logOptions);

logs.on('error', (err) => {
  // serverLog("Could not write to " + logfile);
  // until we learn if this happens, crash
  console.error(err);
  process.exit(4);
});

// re-open log file for log rotation
process.on('SIGPIPE', () => {
  serverLog('Reveived SIGPIPE');
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
        var body = [];
        var tot = 0;
        req.on('data', function (data) {
            if (debugQ) {
              serverLog('DEBUG', 'Got ' + data.length + ' bytes');
            }

            tot += data.length
            if (tot > MAXBODY ) {
              serverLog('Received input larger than ' + MAXBODY);
            } else {
              body.push(data);              
            }
        });
        req.on('end', function () {
            if (debugQ) serverLog('DEBUG', 'Got end');
            if (tot <= MAXBODY) {
              logger(logs, Buffer.concat(body).toString());
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
        serverLog('Unrecognized HTTP method verb ' + req.method);
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
