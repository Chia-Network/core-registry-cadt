const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/server.js', // Update this to the entry point of your application
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
    extensions: ['.js', '.cjs', 'mjs', 'json'],
  },
};
