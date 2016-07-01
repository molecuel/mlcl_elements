'use strict';
import mongodb = require('mongodb');
import elasticsearch = require('elasticsearch');

class Elements {
  public static loaderversion = 2;

  private mongoClient: mongodb.MongoClient;
  private mongoConnection: Promise<mongodb.Db>;
  private elasticClient: elasticsearch.Client;
  private elasticConnection: PromiseLike<elasticsearch.Client>;

  constructor(mlcl?: any, config?: any) {
    this.mongoClient = mongodb.MongoClient;
    this.elasticClient = new elasticsearch.Client({
      host: 'localhost:9200',
      log: 'trace'
    });
  }

  protected mongoConnectWrapper(): Promise<any> {
    return this.mongoClient.connect('mongodb://localhost/elements?connectTimeoutMS=10000&socketTimeoutMS=10000', { promiseLibrary: Promise });
  }

  protected async connectMongo() {
    this.mongoConnection = await this.mongoConnectWrapper();
  }

  protected elasticConnectWrapper(): PromiseLike<any> {
    return this.elasticClient.ping({
      requestTimeout: 30000,
      hello: 'elasticsearch'
    });
  }
  protected async connectElastic() {
    this.elasticConnection = await this.elasticConnectWrapper();
  }

  public async connect() {
    await this.connectElastic();
    await this.connectMongo();
  }
}

export = Elements;
