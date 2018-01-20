# simple Node.js server


.PHONY: test clean centos6
	
NODE = node	

BF = ReadMe.md fslogger.js tests/doc.json
	
# include if needed local changes	
-include .makefile	

MACTAR = --disable-copyfile --exclude .DS_Store
ZIPEXT = $(shell hg id -i| head -1 | grep -oE '[a-f0-9]{5,}' | cut -b '1-5')

C6 = systems/centos6/base
C6HOME = /opt/share/fslogger
BC6H = $(C6)$(C6HOME)

centos6:
	/bin/rm -r -f $(BC6H)
	mkdir -p $(BC6H)
	install -m 0664 $(BF) $(BC6H)
	install -m 0664 systems/chris.conf $(BC6H)/fslogger.conf.orig
	cd $(C6); tar -czf ../files.tgz $(MACTAR) *	
	mkdir fslogger-$(ZIPEXT)
	cp systems/centos6/{files.tgz,installer} fslogger-$(ZIPEXT)
	tar -cf fslogger-$(ZIPEXT).tar $(MACTAR) fslogger-$(ZIPEXT)
	/bin/rm -f -r fslogger-$(ZIPEXT)
	
test:
	@ cd tests; doTest

clean:
	if [ -d fslogger ]; then /bin/rm -f -r fslogger; fi
	/bin/rm -f pbit.log{,.1} fslogger-*.{zip,tgz,tar} server.log
	/bin/rm -f tests/{server.log,pbit.log}{,.1}
	/bin/rm -f -r systems/centos6/files.tgz $(BC6H)
