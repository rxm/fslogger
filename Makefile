# simple Node.js server


.PHONY: simple ss test clean centos6 run kill
	
NODE = node	

BF = ReadMe.md fslogger.js tests/doc.json
	
# include if needed local changes	
-include .makefile	

MACTAR = --disable-copyfile --exclude .DS_Store
ZIPEXT = $(shell hg sum | grep -oE '[a-f0-9]{5,}' | cut -b '1-5')

C6 = systems/centos6/base
C6HOME = /usr/local/share/fslogger
BC6H = $(C6)$(C6HOME)

centos6:
	/bin/rm -r -f $(BC6H)
	mkdir -p $(BC6H)
	cp $(BF) $(BC6H)
	cp systems/chris.conf $(BC6H)/fslogger.conf.orig
	cd $(C6); tar -czf ../files.tgz $(MACTAR) *
	mkdir fslogger-$(ZIPEXT)
	cp systems/centos6/{files.tgz,installer} fslogger-$(ZIPEXT)
	tar -cf fslogger-$(ZIPEXT).tar $(MACTAR) fslogger-$(ZIPEXT)
	/bin/rm -f -r fslogger-$(ZIPEXT)

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

clean:
	if [ -d fslogger ]; then /bin/rm -f -r fslogger; fi
	/bin/rm -f pbit.log fslogger-*.{zip,tgz,tar} server.log .fslogger_pid
	/bin/rm -f tests/{server.log,pbit.log}
	/bin/rm -f -r systems/centos6/files.tgz $(BC6H)
