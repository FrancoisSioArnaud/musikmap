/**
 * Module Themer KI v2.1.4
 * SASS+ / LESS+ / JS?
 * Syntax Javascript ES 6
 */
'use strict';
const gulp = require('gulp');
const $ = require('gulp-load-plugins')();          // on garde pour less/sourcemaps/cleanCss/if
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');                    // v4 (CommonJS)
const through2 = require('through2');
const log = require('fancy-log');
const lazypipe = require('lazypipe');
const mergeStream = require('merge-stream');
const currentVersion = require('node-version');

// Remplacements/ajouts
const postcss = require('gulp-postcss');           // <- on passe par PostCSS
const autoprefixer = require('autoprefixer');      // <- plugin PostCSS (pas gulp-autoprefixer)
const cleanCSS = require('gulp-clean-css');

const dartSass = require('sass');
const gulpSass = require('gulp-sass')(dartSass);

/**
 * ---------------------------------------
 * Configuration
 * ---------------------------------------
 */
let configFile = require('./projects.json');
let _config = configFile.config,
    _projects = configFile.projects;

/**
 * ---------------------------------------
 * Tools
 * ---------------------------------------
 */
let tools = {
  createFilePathList(srcDir, fileNamesArray) {
    let filePathList = [];
    fileNamesArray.forEach((fileName) => {
      const filePath = path.join(srcDir, fileName);
      if (fs.existsSync(filePath)) filePathList.push(filePath);
      else log(chalk.red('   Oups fichier introuvable...'), filePath);
    });
    return filePathList;
  },

  createProjectsArray(projects) {
    const _this = this;
    projects.forEach((project) => {
      log('  Project Found:', chalk.green(project.name ? project.name : 'n/a'), 'in', chalk.green(project.path), chalk.reset(' '));
      project.filePathList = _this.createFilePathList((path.join(project.path, project.dir.src)), project.files);
    });

    if (projects.length) log('-- Config OK! Found', projects.length, 'project(s)');
    else log.warn('-- Configuration empty...');
    log(); // Empty line
    return projects;
  },

  lintSassPipelineBuilder(compiler) {
    const sassLintEnabled = (_config.lint.sass && compiler === 'sass');
    return lazypipe()
      .pipe(() => $.if(sassLintEnabled, $.sassLint()))
      .pipe(() => $.if(sassLintEnabled, $.sassLint.format()))
      .pipe(() => $.if((sassLintEnabled && _config.lint.failOnError), $.sassLint.failOnError()));
  },

  cssCompilerPipelineBuilder(compiler, sourcemap, minify) {
    return lazypipe()
      .pipe(() => $.if(sourcemap, $.sourcemaps.init()))
      .pipe(() => $.if((compiler === 'less'), $.less()))
      .pipe(() => $.if((compiler === 'sass'),
        gulpSass({}).on('error', gulpSass.logError)
      ))
      // Autoprefixer via PostCSS
      .pipe(() => postcss([autoprefixer()]))
      // Minification conditionnelle
      .pipe(() => $.if(minify, cleanCSS()))
      // Sourcemaps en fin de pipeline si demandé
      .pipe(() => $.if(sourcemap, $.sourcemaps.write('.')));
  },

  printTaskState(project) {
    return through2({ objectMode: true }, function (chunk, enc, callback) {
      log(
        chalk.blue.bold('[Compiling]\t'),
        chalk.green(project.name ? project.name : 'n/a') +
        chalk.magenta(' => ', path.join(chunk.base, chunk.basename)) +
        chalk.reset(' ')
      );
      this.push(chunk);
      callback();
    });
  },

  printLintTaskState(project) {
    return through2({ objectMode: true }, function (chunk, enc, callback) {
      log(
        chalk.red.bold('[Linting]\t'),
        chalk.green(project.name ? project.name : 'n/a') +
        chalk.grey(' => ', path.join(chunk.base, chunk.basename)) +
        chalk.reset(' ')
      );
      this.push(chunk);
      callback();
    });
  },

  prepareProjectPipes(projects, sourcemap, minify) {
    const _this = this;
    let mainStream = mergeStream();

    projects.forEach((project) => {
      // Linter
      if (project.lint) {
        const lintStream = gulp.src(
          path.join(project.path, project.dir.src) + '/**/*' + _config.extension[project.compiler],
          { base: (path.join(project.path, project.dir.src)), allowEmpty: true }
        )
          .pipe(_this.printLintTaskState(project))
          .pipe(_this.lintSassPipelineBuilder(project.compiler)());
        mainStream.add(lintStream);
      }

      // Compiler
      const tmpStream = gulp.src(project.filePathList, { base: (path.join(project.path, project.dir.src)), allowEmpty: true })
        .pipe(_this.printTaskState(project))
        .pipe(_this.cssCompilerPipelineBuilder(project.compiler, sourcemap, minify)())
        .pipe(gulp.dest(path.join(project.path, project.dir.dest)));

      mainStream.add(tmpStream);
    });

    return mainStream;
  }
};

/**
 * Start / Init
 */
log.info(chalk.green('#########################################'));
log.info(chalk.green('##    Module Themer KI SASS & LESS     ##'));
log.info(chalk.green('#########################################'));
log.info('This module version ', configFile.version);

if (currentVersion.major < 14) {
  log.info('Node Version', process.version, chalk.red.bold('Not supported (<14)'), chalk.reset(' '));
  log.warn(chalk.reset('-----------------------'));
  log.warn(chalk.red.bold('!! Your Node version is not supported !!'), chalk.reset(' '));
  log.warn(chalk.red.bold('(requires Node >= 14)'), chalk.reset(' '));
  log.warn(chalk.reset('-----------------------'));
} else {
  log.info('Node Version', process.version, chalk.green.bold('OK'), chalk.reset(' '));
}
log.info(chalk.green('## Preparation...'));

let projectsPrepared = tools.createProjectsArray(_projects);

/**
 * Tasks
 */
gulp.task('dev', () => tools.prepareProjectPipes(projectsPrepared, true, false));
gulp.task('dev-sans-sourcemap', () => tools.prepareProjectPipes(projectsPrepared, false, false));
gulp.task('prod', () => tools.prepareProjectPipes(projectsPrepared, false, true));

gulp.task('watcher-dev', () => {
  let sourcemap = true, minify = false;
  projectsPrepared.forEach((project) => {
    gulp.watch(
      path.join(project.path, project.dir.src, "**/*" + _config.extension[project.compiler]).replace(/\\/g, '/'),
      { usePolling: _config.partageReseau },
      function compilation() {
        return tools.prepareProjectPipes([project], sourcemap, minify);
      }
    );
  });
});

gulp.task('default', gulp.series('dev', 'watcher-dev'));
