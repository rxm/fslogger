# simple Node.js server


.PHONY: test clean centos6
	
NODE = node	

BF = ReadMe.md fslogger.js tests/doc.json
	
# include if needed local changes	
-include .makefile	

# fix if not on the Mac
MACTAR = --disable-copyfile --exclude .DS_Store
ZIPEXT = $(shell hg id -i| head -1 | grep -oE '[a-f0-9]{5,}' | cut -b '1-5')


centos6:
	tar -cf systems/centos6/files.tar $(MACTAR) $(BF)
	cd systems/centos6; \
	     tar -uf files.tar $(MACTAR) fslogger.conf.orig
	tar -czf fslogger-$(ZIPEXT).tgz $(MACTAR) \
	     -C systems -s /centos6/fslogger/ centos6
	echo rm systems/centos6/files.tar
	
test:
	@ cd tests; doTest

clean:
	/bin/rm -f pbit.log{,.1} fslogger-*.{zip,tgz,tar} server.log
	/bin/rm -f tests/{server.log,pbit.log}{,.1}
	/bin/rm -f -r systems/centos6/files.tar
