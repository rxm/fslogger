
# Write pBit detections to files

> **Version 0.1.5** of fslogger, a Node server that writes POST requests to a file translating DeepXi JSON into ArcSight CEF

## Installing

This is still a 0.1 version of the server script.  It still needs a few auxiliary scripts, such as monitoring.  The CEF format emitted is still in development.  Time conversions make the assumption that the host running the server and the ArcSight instance are in the same timezone.

The script `fslogger.js` has been tested with Node v6.4.0 and Node v8.9.3. To install it a few parameters need to be configured in `fslogger.conf` that needs to be in the directory from where the script is launched.  This is controlled by the string in `configPath` in the script.  If the configuration file is not found, a message is emitted and the server continues with its defaults.

port
: the port the server will listen on.  Set to 8888.  A working installation may require setting it to 80.

host
: set it to `127.0.0.1` to test locally, otherwise omit or set to `null`.

path
: the full path to the log file.  If just a filename is given, the logfile will be created in the same directory that server is launched.  A production install would set it to something like `/var/log/pbit/detections.log`.

timezoneStrings
: an object where the values are three letter time zone strings and the keys are the offset in minutes (relative to GMT) to the corresponding values.  The object should have a value for all possible offsets that may be seen in the host of the server.  If ommitted, the timezone will be ommitted from the CEF entry.

To launch the server (as a super user if using port 80):

``` bash
node fslogger.js &
```

Sample data will show up in the `pbit.log` file


## Test

Open two terminals and change both to the directory with `fslogger.js` and the log file `pbit.log`.  Then issue the commands below.  The `curl` will POST data to the server.  Renaming the log file tests that it is safe to use `logrotate`.

The `fslogger` server may also produce messages.  A few stratup and termination messages are printed to the `stderr` and the operational ones are sent to `stdout`.

``` bash
 # in window 1 start fslogger
 node fslogger.js 1> server.log &
 
 # in window 2 
 curl -X POST http://127.0.0.1:8888 -d @doc.json && echo
 
 # in windeow 1
 mv pbit.log pbit.log.1
 
 # in window 2
 curl -X POST http://127.0.0.1:8888 -d @doc.json && echo

 # window 1
 kill -PIPE %1
 
 # window 2
 curl -X POST http://127.0.0.1:8888 -d @doc.json && echo
 
 # window 1
 kill %1
 cat pbit.log    # one line
 cat pbit.log.1  # two lines
```

## Developing

I have an unusual Node setup on my laptop (to isolate potential mistakes and unchecked libraries).  I handle that by keeping some changes to the Makefile in a local directory `.makefile`.