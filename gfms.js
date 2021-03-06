var argv = require('optimist')
	.usage('\nGithub Flavored Markdown Server.\nRun in your project\'s root directory.\nUsage: $0')
	.demand('p')
	.alias('p', 'port')
	.describe('p', 'Port number to listen at.')
	.alias('h', 'host')
	.describe('h', 'Host address to bind to.')
	.default('h', 'localhost')
	.argv;

var sio = require('socket.io'), io;
var express = require('express');
var stylus = require('stylus');
var nib = require('nib');
var app = express.createServer();
var markdown = //require('github-flavored-markdown').parse;
	require('./showdown.js').parse;
var _ = require('underscore');
var fs = require('fs');
var request = require('request');

var laeh = require('laeh2').leanStacks(true);
var _e = laeh._e;
var _x = laeh._x;

var watched = {};
var styles = [];

app.configure(function() {

	var pub = __dirname + '/public';
	var views = __dirname + '/views';
	app.set('views', views);
	app.set('view engine', 'jade');
	app.set('view options', { layout: false });


	if(process.env.NODE_ENV === 'development') {
		// only use Stylus in development, because when gfms is installed
		// globally with sudo, and then run by an user, it cannot create
		// the generate .css files (and I'm too tired to look for a solution now).
		app.use(stylus.middleware({
			src: views,
			dest: pub,
			compile: function(str, path) {
				return stylus(str)
					.set('filename', path)
					.set('compress', true)
					.use(nib())
					.import('nib');
			}
		}));
	}

	app.use(express.favicon());
	app.use(app.router);
	app.use(express.static(pub));
	app.use(express.errorHandler({ dump: true, stack: true }));
});

app.configure('development', function() {
	require('utilz').watchFile(__filename);
});

function basename(fn) {
	var m = fn.match(/.*?([^\/]+)\/?$/);
	return m ? m[1] : fn;
}

function is_markdown(v) {
	return v.match(/.*?(?:\.md|\.markdown)$/) ? true : false;
}

app.get('*', function(req, res, next) {
	
	var base = req.path.replace('..', 'DENIED').replace(/\/$/, '');
	var dir = process.cwd() + base;
	
	var stat;
	try {
		stat = fs.statSync(dir);
	}
	catch(e) {
		return next();
	}
	
	if(stat.isDirectory()) {
		
		var files = _.chain(fs.readdirSync(dir)).filter(function(v) {
			var stat = fs.statSync(dir + '/' + v);
			return stat.isDirectory() || (stat.isFile() && is_markdown(v));
		}).map(function(v) {
			return {
				url: base + '/' + v,
				name: v
			};
		}).value();
		
		res.render('directory', {
			files: files,
			dir: dir,
			styles: styles,
			title: basename(dir)
		});
	}
	else if(is_markdown(dir)) {
		
		if(!watched[dir]) {
			fs.watchFile(dir, { interval: 500 }, function(curr, prev) {
				if(curr.mtime.getTime() !== prev.mtime.getTime()) {
					console.log('file ' + dir + ' has changed');
					io.sockets.json.send({ update: dir, content: markdown(fs.readFileSync(dir, 'utf8')) });
				}
			});
			watched[dir] = true;
		}
		
		res.render('file', {
			file: markdown(fs.readFileSync(dir, 'utf8')),
			title: basename(dir),
			styles: styles,
			fullname: dir
		});
	}
	else
		return next();
});

process.on('SIGINT', function() {
	console.log('\nGFMS exit.');
	return process.exit();
});

console.log('Getting .css links from Github...');

request('http://www.github.com', function(err, res, body) {

	if(err || res.statusCode != 200)
		throw 'Cannot load .css links from Github';
		
	var m, re = /<link href="(.+?)" media="screen" rel="stylesheet" type="text\/css" \/>/g;
	while(m = re.exec(body))
		styles.push(m[1]);
		
	if(!styles.length)
		throw 'Cannot parse .css links from Github';

	app.listen(argv.p, argv.h);
	io = sio.listen(app);
	io.set('log level', 1);
	
	console.log('GFMS serving ' + process.cwd() + ' at http://' + argv.h + ':' + argv.p + '/ - press CTRL+C to exit.');
});
