.PHONY: all test check proof run help

all: test

test:
	node --test

check:
	node -e "const pkg = require('./package.json'); if (Object.keys(pkg.dependencies || {}).length > 0) process.exit(1); console.log('Zero dependencies verified.');"

proof:
	@echo "Checking runtime dependencies..."
	@node -e "console.log('Dependencies:', require('./package.json').dependencies);"
	@echo "Running test suite..."
	node --test

run:
	node bin/rewind.js help
