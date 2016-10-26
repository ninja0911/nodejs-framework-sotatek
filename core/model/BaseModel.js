var BaseClass           = require('../common/BaseClass');
var BaseEntity          = require('../entity/BaseEntity');
var logger              = log4js.getLogger('BaseModel');

var BaseModel = BaseClass.extend({
  classname   : 'BaseModel',

  // Fixed properties for all models
  $Entity           : BaseEntity,
  $primaryKeys      : ['id'],     // Currently it's always `id`
  $pkAutoIncrement  : true,       // Always true
  $predefinedCols   : ['created_at', 'updated_at', 'created_by', 'updated_by'],
  $excludedCols     : ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'],

  /**
   * Customizable properties will be defined in derived model
   * See UserModel for references
   */

  // Will be used in auto-generated CRUD APIs
  // May be overrided in derived models
  $getPluralTableName: function() {
    return this.tableName + 's';
  },

  initialize : function(exSession, masterConfig, slaveConfig) {
    // logger.info(this.classname + '::initialize exSession=' + exSession);
    if (!masterConfig) {
      throw new Error('Invalid config for master adapter');
    }

    if (!slaveConfig) {
      throw new Error('Invalid config for slave adapter');
    }

    this._exSession       = exSession;
    this._useMasterSelect = false;
    this._masterAdapter   = AdapterFactory.create(exSession, masterConfig);
    this._slaveAdapter    = AdapterFactory.create(exSession, slaveConfig);
  },

  getAttributeNames : function() {
    var columnNames = this.getColumnNames();
    return _.map(columnNames, Utils.convertToCamelCase);
  },

  getMasterAdapter : function() {
    return this._masterAdapter;
  },

  getSlaveAdapter : function() {
    return this._slaveAdapter;
  },

  getColumnNames : function() {
    return this.primaryKeys.concat(_.keys(this.columns)).concat(this.predefinedCols);
  },

  isUseMasterSelect : function() {
    return this._useMasterSelect;
  },

  setUseMasterSelect : function(flag) {
    this._useMasterSelect = !!flag;
  },

  getExSession: function() {
    return this._exSession;
  },

  _getAdapterForSelect: function() {
    if (this.isUseMasterSelect()) {
      return this._masterAdapter;
    }
    return this._slaveAdapter;
  },

  _constructEntity : function(data) {
    var entity = new this.Entity(this, data);
    return entity;
  },

  _convertObjectsToCamelCase: function(data) {
    if (!_.isArray(data)) {
      logger.error('_convertObjectsToCamelCase: invalid parameters data=' + util.inspect(data));
      return null;
    }

    var self = this,
        result = [];
    _.forEach(data, function(e) {
      result.push(self._convertOneObjectToCamelCase(e));
    });

    return result;
  },

  _convertOneObjectToCamelCase: function(data) {
    if (!_.isObject(data)) {
      logger.error('_convertOneObjectToCamelCase: invalid parameters data=' + util.inspect(data));
      return null;
    }

    var result = {};
    for (var p in data) {
      result[Utils.convertToCamelCase(p)] = data[p];
    }

    return result;
  },

  _isEntityObject : function(data) {
    if (!data) {
      return false;
    }

    return (data instanceof this.Entity);
  },

  _select : function(options, callback) {
    var self = this;
    async.auto({
      select : function(next) {
        var adapter = self._useMasterSelect ? self._masterAdapter : self._slaveAdapter;
        adapter.select(self.tableName, options, next);
      },
      construct : ['select', function(ret, next) {
        var rawDatas = ret.select;
        var entities = [];
        _.each(rawDatas, function(rawData) {
          entities.push(self._constructEntity(rawData));
        });
        next(null, entities);
      }],
    }, function(err, ret) {
      if (err) {
        callback(err);
        return;
      }
      callback(err, ret.construct);
    });
  },

  /**
   * @param {BaseEntity} entity
   * @param {Function} callback
   */
  _updateOne : function(entity, callback) {
    if (entity.isNew()) {
      logger.error('Cannot update new entity: ' + util.inspect(entity));
      callback('Cannot update new entity');
      return;
    }

    entity.save(callback);
  },

  /**
   * @param {object} options - The settings for update query.
   *   Options can contains:
   *   - {string} set     : update clause in statement
   *   - {string} where   : where clause in statment
   *   - {array}  params  : parameters for preparing statement
   */
  _updateBatch : function(options, callback) {
    var now = Utils.now();
    var userId = this._exSession.getUserId();
    options.set += ', created_at=' + now + ', updated_by=' + userId;
    this._masterAdapter.updateBatch(this.tableName, options, callback);
  },

  /**
   * Same specs with find, but will try to get data from cache first instead of db
   * Currently it's just an alias of find
   * TODO: implement cache mechanism
   */
  findCache: function(options, callback) {
    this.find(options, callback);
  },

  /**
   * @param {object} options - The settings for update query.
   *   Options can contains:
   *   - {string} where   : where clause in statment
   *   - {number} offset  :
   *   - {number} limit   : limit the records number
   *   - {array}  params  : parameters for preparing statement
   */
  find : function(options, callback) {
    this._select(options, callback);
  },

  /**
   * Same specs with findOne, but will try to get data from cache first instead of db
   * Currently it's just an alias of findOne
   * TODO: implement cache mechanism
   */
  findCacheOne: function(id, callback) {
    this.findOne(id, callback);
  },

  /**
   * @param {number} id - The id of record that we want to find
   */
  findOne : function(id, callback) {
    var options;
    if (typeof id === 'number' || typeof id === 'string') {
      options = {
        where   : 'id=?',
        params  : [id],
      };
    } else {
      options = id;
    }

    options.limit = 1;
    this._select(options, function(err, ret) {
      if (err) {
        callback(err);
        return;
      }

      if (_.isArray(ret) && ret.length > 0) {
        callback(err, ret[0]);
      } else {
        callback(err, null);
      }
    });
  },

  // Find alias
  select : function(options, callback) {
    this.find(options, callback);
  },

  // FindOne alias
  selectOne : function(id, callback) {
    this.findOne(id, callback);
  },

  /**
   * @param {Integer} id
   * @param {Function} callback
   */
  findById: function(id, callback) {
    this.findOne(id, callback);
  },

  /**
   * @param {Object|Array|BaseEntity} entity
   * @param {Function} callback
   */
  add : function(data, callback) {
    var self = this;
    if (self._isEntityObject(data)) {
      data.save(callback);
    } else if (_.isArray(data) && data.length > 0) {
      var entities = [];
      if (_.every(data, self._isEntityObject.bind(self))) {
        entities = data;
      } else {
        entities = _.map(data, function(rawData) {
          return self._constructEntity(rawData);
        });
      }

      self._masterAdapter.insertBatch(entities, function(err, ret) {
        if (err) {
          callback(err);
          return;
        }

        self._reloadAfterBatchInsert(ret, callback);
      });
    } else if (typeof data === 'object') {
      self._constructEntity(data).save(callback);
    } else {
      var errMsg = self.classname + '::insert invalid data=' + util.inspect(data);
      callback(errMsg);
    }
  },

  /**
   * For purpose to return full objects after batch insert
   * TODO: Change API for other adapter types
   * Consider about performance
   */
  _reloadAfterBatchInsert: function(ret, callback) {
    var insertId = ret.insertId,
        count = ret.affectedRows;

    this.select({
      where: 'id >= ? and id <= ?',
      params: [insertId, insertId + count - 1],
    }, callback);
  },

  // Add alias
  insert: function(data, callback) {
    this.add(data, callback);
  },

  update : function(data, callback) {
    var self = this;
    if (self._isEntityObject(data)) {
      self._updateOne(data, callback);
    } else if (typeof data === 'object' && data.set) {
      self._updateBatch(data, callback);
    } else if (typeof data === 'object') {
      if (data.id > 0) {
        self.findOne(data.id, function(err, entity) {
          if (err) {
            callback(err);
            return;
          }
          entity.setData(data).save(callback);
        });
      } else {
        callback('Invalid data to update: ' + JSON.stringify(data));
      }
    } else {
      var errMsg = self.classname + '::update invalid data=' + util.inspect(data);
      callback(errMsg);
    }
  },

  delete: function(data, callback) {
    var self = this;
    if (data && !isNaN(data)) {
      if (typeof data !== 'number') {
        data = parseInt(data);
      }

      self.delete({
        where   : 'id=?',
        params  : [data],
      }, callback);
    } else if (self._isEntityObject(data)) {
      self._masterAdapter.deleteOne(data, callback);
    } else {
      self._masterAdapter.deleteBatch(self.tableName, data, callback);
    }
  },

  count: function(options, callback) {
    var self = this;
    var adapter = self._getAdapterForSelect();
    adapter.count(self.tableName, options, callback);
  },

  countGroupBy: function(groupCols, options, callback) {
    var self = this;
    var adapter = self._getAdapterForSelect();
    adapter.countGroupBy(self.tableName, groupCols, options, function(err, ret) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, self._convertObjectsToCamelCase(ret));
    });
  },

  sum: function(column, options, callback) {
    var self = this;
    var adapter = self._getAdapterForSelect();
    adapter.sum(self.tableName, column, options, callback);
  },

  sumGroupBy: function(column, options, callback) {
    var self = this;
    var adapter = self._getAdapterForSelect();
    adapter.sumGroupBy(self.tableName, column, options, callback);
  },

  existed: function(options, callback) {
    var self = this;
    var adapter = self._getAdapterForSelect();
    adapter.existed(self.tableName, options, callback);
  },

  // commit: function(callback) {
  //   this._exSession.commit(callback);
  // },

  // rollback: function(callback) {
  //   this._exSession.rollback(callback);
  // },

  singleCommit: function(callback) {
    this._masterAdapter.commit(callback);
  },

  singleRollback: function(callback) {
    this._masterAdapter.rollback(callback);
  },

  $whereIn: function(column, length) {
    if (!length) {
      var msg = util.format(
        'Invalid settings for building where clause: column=%s, length=%d',
        column, length
      );
      // TODO: Just for easier debug in development phase
      // should log error only instead of throwing error
      throw new Error(msg);
    }

    var place = [];
    for (var i = 0; i < length; i++) {
        place.push('?');
    }
    return '`' + column + '` in (' + place.join(',') + ')';
  },

  destroy : function() {
    if (this._masterAdapter) {
      this._masterAdapter.destroy();
    }

    if (this._slaveAdapter) {
      this._slaveAdapter.destroy();
    }

    delete this._masterAdapter;
    delete this._slaveAdapter;
    delete this._exSession;
  },

});

module.exports = BaseModel;
