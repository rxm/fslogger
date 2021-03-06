#!/bin/sh
#
# fslogger - this script starts and stops the fslogger Nodejs deamon
#
# chkconfig:    345 85 15
# description:  nodejs server that accepts POSTs from Permissionbit's DeepXi
#
# processname: fslogger
# config:      /opt/fslogger/fslogger.conf
# pidfile:     /var/run/fslogger.pid

# Source function library.
. /etc/rc.d/init.d/functions

# Source networking configuration.
. /etc/sysconfig/network

# Check that networking is up.
[ "$NETWORKING" = "no" ] && exit 0

pidfile=/var/run/fslogger.pid
fshome=/usr/share/fslogger
node=/usr/bin/node
# name of program for printout
prog=fslogger
serverlog=/var/log/fslogger.log


start() {
    tmpidf=/tmp/fslogger.$RANDOM
    [ -x $node ] || exit 5
    [ -f $fshome/fslogger.js ] || exit 6
    printf '%-60s' "Starting $prog"
    runuser fslogger -c "bash -c \"(cd $fshome; echo \\\$BASHPID >> $tmpidf ; exec $node ./fslogger.js) & \"" >> $serverlog 2>&1
    sleep 1
    if [ -f $tmpidf ]; then mv $tmpidf $pidfile; fi
    c_status
    retval=$?
    if [ $retval -eq 0 ]
    then
      printf '[ OK ]\n'
    else
      printf '[FAILED]\n'
    fi
    return $retval
}

stop() {
    printf '%-60s' "Stopping $prog"
    [ -f $pidfile ] || exit 7
    kill $(cat $pidfile)
    retval=$?
    [ $retval -eq 0 ] && rm -f $pidfile
    if [ $retval -eq 0 ]; then printf '[ OK ]\n' ; else printf '[FAILED]\n'; fi
    return $retval
}

restart() {
    stop
    start
}

reload() {
    printf '%-60s' "Reloading $prog"
    [ -f $pidfile ] || exit 8
    kill -PIPE $(cat $pidfile)
    retval=$?
    if [ $retval -eq 0 ]; then printf '[ OK ]\n' ; else printf '[FAILED]\n'; fi
    return $retval
}

status() {
    if c_status
    then
       echo "$prog (pid $(cat $pidfile)) is running ..."
    else
       echo "$prog is stopped"
    fi
}

c_status() {
    retval=1
    if [ -f $pidfile ]
    then
      pid=$(cat $pidfile)
      ps -q $pid -o state= | grep '[IRS]' > /dev/null 2>&1
      retval=$?
    fi

    return $retval
}


case "$1" in
    start)
      c_status && exit 0
      $1
      ;;
    reload|restart|stop)
      c_status || exit 0
      $1
      ;;
    status)
      status
      ;;
    *)
      echo $"Usage: $0 {reload|restart|start|status|stop}"
      exit 2
esac