'use strict'
let BSON = require('bson');
import 'reflect-metadata';
import mongodb = require('mongodb');
import should = require('should');
import assert = require('assert');
import _ = require('lodash');
import { Elements } from '../dist';
import { Element } from '../dist/classes/Element';
import * as V from 'tsvalidate';

class Post extends Element {
  @V.InArray(['hello', 'world'])
  text: string;
}

class SmallTestClass extends Element {
  constructor(value?: any, obj?: Object) {
    super();
    this.prop = value || true;
    this.obj = obj || {};
  }
  @V.Contains('hello')
  prop: any;
  obj: Object;
  func: any = function() { };
  public meth() {

  }
}

describe('mlcl', function() {
  let el: Elements;
  let bson = new BSON.BSONPure.BSON();

  describe('module', function() {
    it('should connect the databases', async function() {
      this.timeout(15000);
      el = new Elements();
      try {
        await el.connect();
      } catch (e) {
        should.not.exist(e);
      }
    });

    it('should register a new data model', function() {
      el.registerClass('post', Post);
      el.registerClass('test', SmallTestClass);
    });

    it('should get a class for a model name', function() {
      let myclass: any = el.getClass('post');
      let mymodel = new myclass();
      assert(mymodel instanceof Post);
    });

    it('should get a instance of a class', function() {
      let mymodel = el.getClassInstance('post');
      assert(mymodel instanceof Post);
    });

    it('should have a instance of Elements as static', function() {
      let mymodel: any = el.getClass('test');
      assert(mymodel.elements instanceof Elements);
    });

    it('should NOT validate the object', function() {
      let testclass: any = el.getClassInstance('post');
      testclass.text = 'huhu';
      let errors = testclass.validate();
      assert(errors.length > 0);
    });

    it('should validate the object', function() {
      let testclass: any = el.getClassInstance('post');
      testclass.text = 'hello';
      let errors = testclass.validate();
      assert(errors.length === 0);
    });

    it('should ready an Element-object for serialization', function() {
      let secondarytestclass: any = { _id: 1, text: 'hello' };
      let testclass: any = el.getClassInstance('post');
      testclass._id = 1;
      testclass.text = 'hello';

      try {
        // // factory-generated instance
        // console.log(testclass.toDbObject());
        // console.log(bson.serialize(testclass.toDbObject()));
        //
        // // locally defined instance
        // console.log(secondarytestclass);
        // console.log(bson.serialize(secondarytestclass));

        assert(_.isEqual(testclass.toDbObject(), secondarytestclass));
        assert(_.isEqual(bson.serialize(testclass.toDbObject()), bson.serialize(secondarytestclass)));
      }
      catch (err) {
        console.log(err);
        should.not.exist(err);
      }
    });

    it('should validate an Element-object and save it into its respective MongoDB collection',
      async function() {
        let testclass: any = el.getClassInstance('post');
        testclass.text = 'hello';
        testclass._id = 1;

        try {
          await el.getMongoConnection().dropCollection('config.projectPrefix_Post');
        }
        catch (err) {
          if (!(err instanceof mongodb.MongoError)) {
            throw err;
          }
        }

        await testclass.save().then((res) => {
          (res.length).should.be.above(0);
          assert.equal(res[0].result.ok, 1);
          assert.equal(res[0].result.n, 1);
          return res;
        }).catch((err) => {
          should.not.exist(err);
          return err;
        });
      });

    it('should NOT validate an Element-object, thus not saving it into its respective MongoDB collection',
      async function() {
        let testclass: any = el.getClassInstance('post');
        testclass.text = 'hello';
        testclass._id = 'invalidId';

        try {
          await el.getMongoConnection().dropCollection('config.projectPrefix_Post');
        }
        catch (err) {
          if (!(err instanceof mongodb.MongoError)) {
            throw err;
          }
        }

        await testclass.save().then((res) => {
          should.not.exist(res);
          return res;
        }).catch((err) => {
          should.exist(err);
          (err.length).should.be.above(0);
          return err;
        });
      });

    it('should validate an array of Element-objects and save them into their respective MongoDB collection(s)',
      async function() {
        let testclass1: any = el.getClassInstance('post');
        let testclass2: any = el.getClassInstance('post');
        testclass1.text = 'hello';
        testclass2.text = 'world';
        testclass1._id = 1;
        testclass2._id = 2;

        try {
          await el.getMongoConnection().dropCollection('config.projectPrefix_Post');
        }
        catch (err) {
          if (!(err instanceof mongodb.MongoError)) {
            throw err;
          }
        }

        await el.saveInstances([testclass1, testclass2]).then((res) => {
          if (typeof res === 'object') {
            assert.equal(res[0].result.ok, 1);
            (res[0].result.n).should.be.above(1);
          }
          return res;
        }).catch((err) => {
          should.not.exist(err);
          return err;
        });
      });

    it('should get a document based off an Element-object as query from the respective collection', async function() {
      let testmodel: any = el.getClass('post');
      let testclass: any = el.getClassInstance('post');
      testclass.text = 'hello';
      testclass._id = 1;

      console.log(await el.getMongoConnection().collection('config.projectPrefix_' + testclass.constructor.name).count());
      await el.getMongoDocuments(testclass).then((res) => {
        // console.log(res);
        return res;
      });
    });

  })
});