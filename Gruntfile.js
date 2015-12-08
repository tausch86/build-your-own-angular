module.exports = function(grunt){

  grunt.initConfig({

    jshint: {
      all: ['src/**/*.js', 'test/**/*.js']

    },

    karma: {
      unit: {
        options: {
          frameworks: ['jasmine'],
          singleRun: true,
          browsers: ['PhantomJS'],
          reporters: ['spec'],
          files: [
          'lib**/*.js',
          'src/**/*.js',
          'test/**/*.js'
          ]
        }
      },
      parse: {
        options: {
          frameworks: ['jasmine'],
          singleRun: true,
          browsers: ['PhantomJS'],
          reporters: ['spec'],
          files: [
          'lib**/*.js',
          'src/parse.js',
          'test/parse_spec.js'
          ]
        }
      }
    }

  });

  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.loadNpmTasks('grunt-karma');

  grunt.registerTask('default', [ 'jshint','karma:unit']);

  grunt.registerTask('parse', ['jshint', 'karma:parse']);

};
