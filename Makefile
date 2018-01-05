# simple Node.js servers


.PHONY: simple ss test clean zip run kill
	
NODE = /Users/ronnie/Unix/Node/bin/node	

zip:
	if [ -d fslogger ]; then /bin/rm -f -r fslogger; fi
	mkdir fslogger
	cp fslogger.js fslogger
	cat ReadMe.md | sed -n -e '/^--/q' -e p > fslogger/ReadMe.md
	cat fslogger.conf | grep -v 'host.*127' > fslogger/fslogger.conf
	cp tests/doc.json fslogger
	zip -r fslogger.zip fslogger

run:
	@ if [ -f .fslogger_pid ]; \
	  then \
	    echo "Old $$(cat .fslogger_pid) still running?";  \
	  else \
	    $(NODE) fslogger.js > server.log & echo $$! > .fslogger_pid; \
	  fi

kill:
	@ kill $$(cat .fslogger_pid) && echo "$$(cat .fslogger_pid) terminated"
	@ /bin/rm -f .fslogger_pid
	
test:
	@ cd tests; doTest

simple: simple.js
	node simple.js

ss: ss.js
	@ echo "open http://127.0.0.1:8888/"
	node ss.js

clean:
	if [ -d fslogger ]; then /bin/rm -f -r fslogger; fi
	/bin/rm -f pbit.log fslogger.zip server.log .fslogger_pid
	/bin/rm -f tests/{server.log,pbit.log}