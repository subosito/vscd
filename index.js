const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const fse = Promise.promisifyAll(require('fs-extra'));
const crypto = require('crypto');
const path = require('path');
const process = require('process');

const backupDir = path.resolve(__dirname, 'backups');
const themesDir = path.resolve(__dirname, 'themes');
const baseDir = 'Contents/Resources';

function checksum(filename) {
  var contents = fs.readFileSync(filename);
  var hash = crypto
    .createHash('md5')
    .update(contents)
    .digest('base64')
    .replace(/=+$/, '');

  return hash;
}

function transform(items, appPath) {
  return new Promise(function(resolve, reject) {
    items = items.map(function(item) {
      item.source = path.join(themesDir, item.source);
      item.target = path.join(appPath, baseDir, item.target);
      item.backup = path.join(backupDir, path.basename(item.target));
      item.sourceHash = checksum(item.source);
      item.targetHash = checksum(item.target);

      return item;
    });

    resolve(items);
  });
}

function wrap(item) {
  return new Promise(function(resolve, reject) {
    resolve(item);
  });
}

function backup(item) {
  return fse.copyAsync(item.target, item.backup)
            .then(function() { return wrap(item); });
}

function overwrite(item) {
  return fse.copyAsync(item.source, item.target)
            .then(function() { return wrap(item); });
}

function append(item) {
  return fs.readFileAsync(item.source)
           .then(function(data) { return fs.appendFileAsync(item.target, data); })
           .then(function() {
             item.checksumHash = checksum(item.target);
             return wrap(item);
           });
}

function perform(item) {
  switch (item.operation) {
    case 'replace':
      return overwrite(item);
    case 'append':
      return append(item);
  }
}

function patch(items) {
  return new Promise(function(resolve, reject) {
    handlers = [];

    items.forEach(function(item) {
      if (item.sourceHash == item.targetHash) {
        return console.log("Already applied: " + item.target);
      }

      handlers.push(backup(item).then(perform));
    });

    Promise.all(handlers).then(function(data) {
      data.forEach(function(item) {
        console.log("Applying: " + item.target);
      });

      resolve(data);
    })
  });
}

function updateInfo(items, productPath) {
  return new Promise(function(resolve, reject) {
    items.forEach(function(item) {
      var product = fs.readFileSync(productPath).toString();
      product = product.replace(item.targetHash, item.checksumHash);
      fs.writeFileSync(productPath, product, 'utf8');
    });

    resolve(items);
  });
}

function apply(appPath) {
  var productPath = path.join(appPath, baseDir, 'app/product.json');
  var mapFile = path.join(themesDir, 'map.json');

  fse.readJsonAsync(mapFile)
     .then(function(items) { return transform(items, appPath); })
     .then(patch)
     .then(function(items) { return updateInfo(items, productPath); });
}

if (process.argv[2]) {
  apply(process.argv[2])
} else {
  console.log('Usage: npm run apply -- "/path/to/Visual Studio Code.app"')
}
