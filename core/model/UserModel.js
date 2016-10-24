var bcrypt        = require('bcryptjs');
var UserEntity    = require('../entity/UserEntity');

module.exports = BaseModel.extend({
  classname : 'UserModel',

  $tableName: 'user',
  $Entity: UserEntity,

  $indexes: {
    'username': ['username'],
    'email': ['email'],
  },

  $uniques: {
    'username': ['username'],
    'email': ['email'],
  },

  dsConfig: {
    read   : 'mysql-slave',
    write  : 'mysql-master',
  },

  add: function($super, data, callback) {
    logger.debug('UserModel::add data=' + util.inspect(data));

    var userInfo = data;
    var hashedPassword = bcrypt.hashSync(userInfo.password || '', bcrypt.genSaltSync(8));
    userInfo.password = hashedPassword;
    $super(data, callback);
  },

});
