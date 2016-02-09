/* eslint strict: 0 */
/* eslint no-sync: 0 */
module.exports = function(gulp, options) {
    'use strict';

    if (!options) options = {};

    const browserify = require('browserify');
    const fs = require('fs');
    const babel = require('gulp-babel');
    const eslint = require('gulp-eslint');
    const liveserver = require('gulp-live-server');
    const sloc = require('gulp-sloc');
    const sourcemaps = require('gulp-sourcemaps');
    const uglify = require('gulp-uglify');
    const gutil = require('gulp-util');
    const jest = require('jest-cli');
    const path = require('path');
    const source = require('vinyl-source-stream');
    const buffer = require('vinyl-buffer');
    const watchify = require('watchify');

    const server = liveserver.new('.');

    gulp.task('default', ['build']);

    gulp.task('lint', ['eslint']);

    gulp.task('build', ['build:server', 'build:browser']);
    gulp.task('build:server', ['babel']);
    gulp.task('build:browser', ['browserify']);

    gulp.task('test', ['eslint', 'jest']);

    gulp.task('serve', ['server']);

    gulp.task('watch', ['watch:server', 'watch:browser', 'sloc'], () => {
        gulp.watch(['.eslintrc', 'gulpfile.js'], ['eslint']);
        gulp.watch('src/**/*', ['sloc']);
    });
    gulp.task('watch:server', ['jest', 'server'], () => {
        gulp.watch(['src/**/*', '!src/browser/**/*', 'config/**/*'], ['jest', 'server']);
        gulp.watch(
            ['dist/**/*', 'public/**/*', 'views/**/*'],
            (file) => server.notify(file)
        );
    });
    gulp.task('watch:browser', ['jest', 'watchify'], () =>
        gulp.watch(['src/**/*', '!src/server/**/*', 'config/**/*'], ['jest', 'watchify']));

    gulp.task('eslint', () =>
        gulp.src(['src/**/*.js', 'gulpfile.js'])
            .pipe(eslint({
                extends: path.join(__dirname, '.eslintrc'),
            }))
            .pipe(eslint.format())
            .pipe(eslint.failAfterError())
    );

    gulp.task('sloc', () =>
        gulp.src('src/**/*.js')
            .pipe(sloc())
    );

    gulp.task(
        'sync-lib',
        (next) => {
            if (!fs.existsSync('lib')) return next();

            const read = (dir) =>
                fs.readdirSync(dir)
                    .map((item) => `${dir}/${item}`)
                    .map((item) => 
                        fs.statSync(item).isDirectory()
                        ? read(item).concat([ item ])
                        : [ item ]
                    )
                    .reduce((a, b) => a.concat(b), []);

            read('lib')
                .filter((item) => !fs.existsSync(item.replace(/^lib/, 'src')))
                .forEach((item) => {
                    gutil.log(`rm ${item}`);
                    if (fs.statSync(item).isDirectory()) {
                        fs.rmdirSync(item);
                    } else {
                        fs.unlinkSync(item);
                    }
                });
            return next();
        }
    );

    gulp.task(
        'babel', ['eslint', 'sync-lib'],
        () => gulp.src('src/**/*.js')
            .pipe(babel({
                presets: [
                    'react',
                    'es2015',
                    'babel-preset-stage-2',
                ],
                sourceMaps: "inline",
                sourceRoot: "src"
            }))
            .pipe(gulp.dest('lib'))
    );

    const BrowserifyConfig = {
        entries: ['lib/browser'],
    };
    const bundle = function(b) {
        if (options.browser === false) {
            return (next) => {
                gutil.log('Skip browser');
                next();
            };
        }

        return function() {
            return b.bundle()
                .on('error', (e) => {
                    throw e;
                })
                .pipe(source('browser.js'))
                .pipe(buffer())
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(uglify())
                .pipe(sourcemaps.write('.'))
                .pipe(gulp.dest('dist/js'));
        };
    };
    const w = watchify(browserify(Object.assign(
        {},
        watchify.args,
        BrowserifyConfig
    )));

    w.on('update', bundle);
    w.on('log', gutil.log);
    gulp.task('watchify', ['babel'], bundle(w));
    gulp.task('browserify', ['babel'], bundle(browserify(BrowserifyConfig)));

    gulp.task('jest', ['babel'], (next) => {
        jest.runCLI({}, path.join(__dirname, '../lib'), (succeeded) => {
            next(!succeeded && new Error('Test failured'));
        });
    });

    gulp.task('server', ['babel'], (next) => {
        server.start();
        next();
    });
};