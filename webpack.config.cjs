const path = require('path');
const glob = require('glob');

module.exports = {
  mode: 'production',
  entry: glob.sync('./src/**/*.{js,cjs,mjs}'),
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.cjs',
    libraryTarget: 'commonjs2', // Ensure the output is in CommonJS format for Node.js
  },
  target: 'node', // Target Node.js environment
  module: {
    rules: [
      {
        test: /\.(js|cjs|mjs)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.cjs', '.mjs', '.json'],
    alias: {
      path: require.resolve('path-browserify'), // required for preferRelative
    },
    preferRelative: true,
  },
};
