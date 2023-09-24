import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// const currentRegion = aws.getRegion({}).then((result) => result.name);
// Fetch the default VPC information from your AWS account:
const vpc = new awsx.ec2.Vpc( 'infra-platform', {
  enableDnsHostnames: true,
  enableDnsSupport: true,
  // vpcEndpointSpecs: [{
  //   privateDnsEnabled: true,
  //   serviceName: 'com.amazonaws.ap-south-1.ecr.dkr',
  //   vpcEndpointType: 'Interface'
  // },
  // {
  //   privateDnsEnabled: true,
  //   serviceName: 'com.amazonaws.ap-south-1.ecr.api',
  //   vpcEndpointType: 'Interface'
  // }],
});



// Export a few interesting fields to make them easy to use:
export const vpcId = vpc.vpcId;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

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
// vpc.natGateways to connect with ECR
// if (vpcPrivateSubnetIds.length && Array.isArray(vpcPrivateSubnetIds)) {
//   for ( const [index, item] of [...vpcPrivateSubnetIds] ) {
//     console.log(item[index])
//     new aws.ec2.NatGateway("example", {
//       connectivityType: "private",
//       subnetId: item[index],
//     });
//   }
// }


const securityGroup = new aws.ec2.SecurityGroup("infra-sg", {
  vpcId: vpcId,
  ingress: [
    {
      description: "TLS from VPC Endpoint",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ['10.0.0.0/16'], // vpc default cidr created.
      ipv6CidrBlocks: [],
    },
    {
      description: "Traffic for infra web from load balancer",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ['0.0.0.0/0'],
      ipv6CidrBlocks: [],
    },
    {
      description: "Traffic from within the VPC Cloud for load balancers",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ['10.0.0.0/16'], // only vpc ip addresses
      ipv6CidrBlocks: [],
    },
    {
      description: "Traffic between containers and target groups",
      fromPort: 5000,
      toPort: 5000,
      protocol: "tcp",
      cidrBlocks: ['10.0.0.0/16'], // only vpc ip addresses
      ipv6CidrBlocks: [],
    }
  ],
  egress: [{
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
      ipv6CidrBlocks: ["::/0"],

  }],
});

// const privateSubnetIds = vpcPrivateSubnetIds
const dkrPrivateSubnetEndpoint = new aws.ec2.VpcEndpoint('dkr', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ap-south-1.ecr.dkr',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds
})

// const dkrPublicSubnetEndpoint = new aws.ec2.VpcEndpoint('dkr', {
//   vpcId: vpcId,
//   privateDnsEnabled: true,
//   serviceName: 'com.amazonaws.ap-south-1.ecr.dkr',
//   vpcEndpointType: 'Interface',
//   securityGroupIds: [securityGroup.id],
//   subnetIds: vpcPublicSubnetIds
// })

const ecrPrivateSubnetEndpoint = new aws.ec2.VpcEndpoint('api', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ap-south-1.ecr.api',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds
})
// const ecrEndpoint = new aws.ec2.VpcEndpoint('api', {
//   vpcId: vpcId,
//   privateDnsEnabled: true,
//   serviceName: 'com.amazonaws.ap-south-1.ecr.api',
//   vpcEndpointType: 'Interface',
//   securityGroupIds: [securityGroup.id],
//   subnetIds: vpcPrivateSubnetIds
// })

// s3 gateway endpoint under the hood ECR uses s3
const s3Endpoint = new aws.ec2.VpcEndpoint('s3', {
  vpcId: vpcId,
  serviceName: 'com.amazonaws.ap-south-1.s3',
  vpcEndpointType: 'Gateway'
})

// cloudwatch vpc endpoint interface under the hood ECR uses s3
const logsEndpoint = new aws.ec2.VpcEndpoint('logs', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ap-south-1.logs',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds
})


const webRepository = new awsx.ecr.Repository("web-ecr", {
  
});
const apiRepository = new awsx.ecr.Repository("api-ecr", {});

// const vpcApiEndpoint = 'vpce-07ea288ab8cab454f-b3mq5l4a.api.ecr.ap-south-1.vpce.amazonaws.com';
// const vpcWebEndpoint = 'vpce-05cdfde3bfbc8afc7-s3cq29mu.api.ecr.ap-south-1.vpce.amazonaws.com';
// let webImageUrl = webRepository.url;
// let apiImageUrl = apiRepository.url;
// const indexOfWebImageUrl = String(webImageUrl).indexOf('.com');
// String(webImageUrl).substring(indexOfWebImageUrl);
// String(webImageUrl).replace('.com', vpcWebEndpoint);
// const indexOfUrl = String(apiImageUrl).indexOf('.com');
// String(apiImageUrl).substring(indexOfUrl);
// String(apiImageUrl).replace('.com', vpcApiEndpoint);

const webImage = new awsx.ecr.Image("web-image", {
    repositoryUrl: webRepository.url,
    path: '../infra-web',
});
const apiImage = new awsx.ecr.Image("api-image", {
    repositoryUrl: apiRepository.url,
    path: '../infra-api',
});

const cluster = new aws.ecs.Cluster("infra-platform", {});

// vpce-07ea288ab8cab454f-b3mq5l4a-ap-south-1d.api.ecr.ap-south-1.vpce.amazonaws.com
// 940123540319.dkr.ecr.ap-south-1.amazonaws.com/api-52efe6d:a7180c185385c978936e4b8e6e3b5038ef6375a2b804ed4cde1c0b4645c81985

const apiLb = new awsx.lb.ApplicationLoadBalancer('api-lb', {
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

const appLb = new awsx.lb.ApplicationLoadBalancer('app-lb', {
  listener: {
    port: 80
  },
  defaultTargetGroup: {
    port: 5000,
    healthCheck: {
      path: '/'
    }
  },
  subnetIds: vpcPrivateSubnetIds,
  securityGroups: [securityGroup.id],
});

// const webTargetGroup = new aws.lb.TargetGroup('web-tg', {
//   port: 80,
//   healthCheck: {
//     path: '/'
//   },
//   vpcId,
//   protocol: 'TCP',
//   targetType: 'alb'
// });

// const weblb = new awsx.lb.NetworkLoadBalancer("web-lb", {
//   listener: {
//     port: 80,
//     defaultActions: [{
//       type: 'forward',
//       targetGroupArn: appLb.defaultTargetGroup.arn
//     }]
//   },
//   defaultTargetGroup: {
//     port: 80,
//     vpcId: vpcId,
//     targetType: "alb",
//     protocol: "TCP",
//   },
//   subnetIds: vpcPublicSubnetIds
// });

// const iamRole = new aws.iam.Role('ecsServiceRole', {

// });

const apiService = new awsx.ecs.FargateService("api", {
  cluster: cluster.arn,
  // iamRole: '',
  name: 'apiService',
  networkConfiguration: {
      /**
       * Subnets associated with the task or service.
       */
      subnets: vpcPrivateSubnetIds,
      securityGroups: [securityGroup.id],
  },
  taskDefinitionArgs: {
      family: 'infra-api',
      logGroup: {
        skip: true,
      },
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
          //     'awslogs-group': "apiService",
          //     'awslogs-region': "ap-south-1",
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

const webService = new awsx.ecs.FargateService("web", {
    cluster: cluster.arn,
    name: 'webService',
    // assignPublicIp: true,
    networkConfiguration: {
      subnets: vpcPrivateSubnetIds,
      securityGroups: [securityGroup.id]
    },
    taskDefinitionArgs: {
        family: 'infra-web',
        logGroup: {
          skip: true,
        },
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
              value: apiLb.loadBalancer.dnsName.apply((dns) => `${dns}/WeatherForecast`)
            }],
            portMappings: [
            {
              name: 'load-balancer',
              targetGroup: appLb.defaultTargetGroup,
              containerPort: 5000,
              hostPort: 5000,
              protocol: 'tcp',
              appProtocol: 'http'
            }],
            // logConfiguration: {
            //   logDriver: 'awslogs',
            //   options: {
            //     'awslogs-create-group': "true",
            //     'awslogs-group': "webService",
            //     'awslogs-region': "ap-south-1",
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

export const url = appLb.loadBalancer.dnsName;
