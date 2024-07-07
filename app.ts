import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import { RustFunction } from '@cdklabs/aws-lambda-rust'

class LambdaRDSStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create a VPC
        const vpc = new ec2.Vpc(this, 'VPC');

        // Admin DB user
        const DB_ADMIN_USERNAME = 'admin';
        const DB_USERNAME = 'lambda';

        // Lambda DB user
        const DB_NAME = 'foo';

        // Create an RDS instance

        // create a RDS MySQL DB
        const db = new rds.DatabaseInstance(this, 'MySql', {
            engine: rds.DatabaseInstanceEngine.MYSQL,
            vpc,
            vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }),
            credentials: rds.Credentials.fromGeneratedSecret(DB_ADMIN_USERNAME),
            iamAuthentication: true,
            databaseName: DB_NAME,
            deleteAutomatedBackups: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        })

        db.connections.allowFromAnyIpv4(ec2.Port.allTcp())

        const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
            securityGroupName: 'LambdaSG',
            allowAllOutbound: true,
            vpc: vpc,
        })
        // create a rust lambda function 
        const rustLambdaFunction = new RustFunction(this, "lambda", {
            entry: 'lambda',
            vpc,
            vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }),
            securityGroups: [lambdaSG],
            environment: {
                DB_HOSTNAME: db.dbInstanceEndpointAddress,
                DB_PORT: db.dbInstanceEndpointPort,
                DB_NAME: DB_NAME,
                DB_USERNAME: DB_USERNAME,
            },
            bundling: {
                forceDockerBundling: true,
            },
            runtime: lambda.Runtime.PROVIDED_AL2023,
            timeout: cdk.Duration.seconds(60),
        });

        /*
        CREATE USER 'lambda' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'; 
        GRANT ALL PRIVILEGES ON foo.* TO 'lambda';
        ALTER USER 'lambda' REQUIRE SSL;
        */
        db.grantConnect(rustLambdaFunction, DB_USERNAME);
        db.connections.allowDefaultPortFrom(rustLambdaFunction);

        // Output the Lambda function ARN
        new cdk.CfnOutput(this, 'LambdaFunctionARN', {
            value: rustLambdaFunction.functionArn,
        });
    }
}

const app = new cdk.App();
new LambdaRDSStack(app, 'LambdaRDSStack');
