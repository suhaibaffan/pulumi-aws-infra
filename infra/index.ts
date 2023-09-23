import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const currentRegion = aws.getRegion({});
// Fetch the default VPC information from your AWS account:
const vpc = new awsx.ec2.Vpc( 'infra', {
  vpcEndpointSpecs: [{
    serviceName: `com.amazonaws.${currentRegion}.ecr.api`,  // enable 
    privateDnsEnabled: true,
  }]
});

// Export a few interesting fields to make them easy to use:
export const vpcId = vpc.vpcId;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;
// export const networkGateways = vpc.natGateways;

// let privRtAssoc = [];
// if (Array.isArray(networkGateways)) {
//   for (let i = 0; i < [...networkGateways].length; i++) {
//   let natGwRoute = new aws.ec2.RouteTable("natgw-route", {
//     vpcId: vpcId,
//     routes: [
//         { cidrBlock: "0.0.0.0/0", natGatewayId: networkGateways[i].id },
//     ],
//   });
  
//       privRtAssoc.push(new aws.ec2.RouteTableAssociation(`priv-rta-${i+1}`, {
//           routeTableId: natGwRoute.id,
//           subnetId: vpcPrivateSubnetIds[i],
//       }));
//   };
// }
// // vpc.natGateways to connect with ECR
// if (vpcPrivateSubnetIds.length && Array.isArray(vpcPrivateSubnetIds)) {
//   for ( const [index, item] of [...vpcPrivateSubnetIds] ) {
//     console.log(item[`[${index}]`])
//     new aws.ec2.NatGateway("example", {
//       connectivityType: "private",
//       subnetId: item[`[${index}]`],
//     });
//   }
// }

const securityGroup = new aws.ec2.SecurityGroup("securityGroup", {
  vpcId: vpcId,
  egress: [{
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
      ipv6CidrBlocks: ["::/0"],

  }],
});

const webRepository = new awsx.ecr.Repository("web", {
  
});
const apiRepository = new awsx.ecr.Repository("api", {});


const webImage = new awsx.ecr.Image("web", {
    repositoryUrl: webRepository.url,
    path: '../infra-web',
});
const apiImage = new awsx.ecr.Image("api", {
    repositoryUrl: apiRepository.url,
    path: '../infra-api',
});

const cluster = new aws.ecs.Cluster("infra", {});
const weblb = new awsx.lb.ApplicationLoadBalancer("web", {
  listener: {
    port: 80
  },
  defaultTargetGroup: {
    port: 5000
  },
  subnetIds: vpcPublicSubnetIds,
  securityGroups: [securityGroup.id],
});



const apiLb = new awsx.lb.ApplicationLoadBalancer('api', {
  listener: {
    port: 80
  },
  defaultTargetGroup: {
    port: 5000,
    healthCheck: {
      path: '/WeatherForecast'
    }
  },
  internal: true,
  subnetIds: vpcPrivateSubnetIds,
  securityGroups: [securityGroup.id],
});


const apiService = new awsx.ecs.FargateService("infra-api", {
  cluster: cluster.arn,
  networkConfiguration: {
      /**
       * Subnets associated with the task or service.
       */
      subnets: vpcPrivateSubnetIds,
      securityGroups: [securityGroup.id],
  },
  taskDefinitionArgs: {
      family: 'infra-api',
      container: {
          cpu: 256,
          memory: 512,
          name: 'infra-api',
          image: apiImage.imageUri,
            essential: true,
          portMappings: [
            {
            name: 'api',
            targetGroup: apiLb.defaultTargetGroup,
            containerPort: 5000,
            hostPort: 5000,
            protocol: 'tcp',
            appProtocol: 'http'
          }
          //   {
          //   name: "api-5000-tcp",
          //   containerPort: 5000,
          //   hostPort: 5000,
          //   protocol: "tcp",
          //   appProtocol: "http"
          // }, {
          //   name: 'internal',
          //   targetGroup: apiLb.defaultTargetGroup
          // }
        ],
          // logConfiguration: {
          //   logDriver: 'awslogs',
          //   options: {
          //     'awslogs-create-group': "true",
          //     'awslogs-group': "/ecs/infra-web",
          //     'awslogs-region': "ca-central-1",
          //     'awslogs-stream-prefix': "ecs"
          //   },
          //   secretOptions: []
          // }
      },
      runtimePlatform: {
        cpuArchitecture: "ARM64",
        operatingSystemFamily: "LINUX"
      },
      cpu: "256",
      memory: "512"
      // pidMode: 'host'
  },
});

console.log(apiService.service);

const webService = new awsx.ecs.FargateService("infra-web", {
    cluster: cluster.arn,
    networkConfiguration: {
      subnets: vpcPublicSubnetIds,
      securityGroups: [securityGroup.id]
    },
    taskDefinitionArgs: {
        family: 'infra-web',
        container: {
            cpu: 256,
            memory: 512,
            name: 'infra-web',
            image: webImage.imageUri,
            // repositoryCredentials: {
            //   credentialsParameter: 
            // },
            essential: true,
            environment: [{
              name: 'ApiAddress',
              value: apiLb.loadBalancer.dnsName
            }],
            portMappings: [
            {
              name: 'load-balancer',
              targetGroup: weblb.defaultTargetGroup,
              containerPort: 5000,
              hostPort: 5000,
              protocol: 'tcp',
              appProtocol: 'http'
            }],
            // logConfiguration: {
            //   logDriver: 'awslogs',
            //   options: {
            //     'awslogs-create-group': "true",
            //     'awslogs-group': "/ecs/infra-web",
            //     'awslogs-region': "ca-central-1",
            //     'awslogs-stream-prefix': "ecs"
            //   },
            //   secretOptions: []
            // }
        },
        runtimePlatform: {
          cpuArchitecture: "ARM64",
          operatingSystemFamily: "LINUX"
        },
        cpu: "256",
        memory: "512"
    },
});

export const url = weblb.loadBalancer.dnsName;