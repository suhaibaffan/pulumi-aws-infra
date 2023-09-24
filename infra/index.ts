import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const vpc = new awsx.ec2.Vpc( 'infra-platform', {
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    ['env']: 'production',
  }
});



// Export a few interesting fields to make them easy to use:
export const vpcId = vpc.vpcId;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

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
  tags: {
    ['env']: 'production',
  }
});

// dkr vpc endpoint to pull the images
const dkrPrivateSubnetEndpoint = new aws.ec2.VpcEndpoint('dkr', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ca-central-1.ecr.dkr',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds,
  tags: {
    ['env']: 'production',
    ['type']: 'dkr'
  }
})

// ecr api vpc endpoint to pull the images
const ecrPrivateSubnetEndpoint = new aws.ec2.VpcEndpoint('api', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ca-central-1.ecr.api',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds
})

// s3 gateway endpoint under the hood ECR uses s3
const s3Endpoint = new aws.ec2.VpcEndpoint('s3', {
  vpcId: vpcId,
  serviceName: 'com.amazonaws.ca-central-1.s3',
  vpcEndpointType: 'Gateway'
})

// cloudwatch vpc endpoint interface under the hood ECR uses s3
const logsEndpoint = new aws.ec2.VpcEndpoint('logs', {
  vpcId: vpcId,
  privateDnsEnabled: true,
  serviceName: 'com.amazonaws.ca-central-1.logs',
  vpcEndpointType: 'Interface',
  securityGroupIds: [securityGroup.id],
  subnetIds: vpcPrivateSubnetIds
})


const webRepository = new awsx.ecr.Repository("web-ecr", {
  
});
const apiRepository = new awsx.ecr.Repository("api-ecr", {});

const webImage = new awsx.ecr.Image("web-image", {
    repositoryUrl: webRepository.url,
    path: '../infra-web',
});
const apiImage = new awsx.ecr.Image("api-image", {
    repositoryUrl: apiRepository.url,
    path: '../infra-api',
});

const cluster = new aws.ecs.Cluster("infra-platform", { tags: { ['env']: 'production' }});

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
  tags: {
    ['env']: 'production',
    ['type']: 'internal'
  }
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
  tags: {
    ['env']: 'production',
    ['type']: 'internal'
  }
});

const webTargetGroup = new aws.lb.TargetGroup('web-tg', {
  port: 80,
  healthCheck: {
    path: '/'
  },
  vpcId,
  protocol: 'TCP',
  targetType: 'alb'
});

const testTargetGroupAttachment = new aws.lb.TargetGroupAttachment("web-tg-attachement", {
  targetGroupArn: webTargetGroup.arn,
  targetId: appLb.loadBalancer.arn,
  port: 80,
});

const weblb = new awsx.lb.NetworkLoadBalancer("web-lb", {
  listener: {
    port: 80,
    defaultActions: [{
      type: 'forward',
      targetGroupArn: webTargetGroup.arn
    }]
  },
  defaultTargetGroup: {
    port: 80,
    vpcId: vpcId,
    targetType: "alb",
    protocol: "TCP",
  },
  subnetIds: vpcPublicSubnetIds,
  tags: {
    ['env']: 'production',
    ['type']: 'external'
  }
});

// const iamRole = new aws.iam.Role('ecsServiceRole', {

// });

const apiService = new awsx.ecs.FargateService("api", {
  cluster: cluster.arn,
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
        ],
      },
      runtimePlatform: {
        cpuArchitecture: "ARM64",
        operatingSystemFamily: "LINUX"
      },
      cpu: "256",
      memory: "512"
  },
  tags: {
    ['env']: 'production',
    ['type']: 'api'
  }
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
            essential: true,
            environment: [{
              name: 'ApiAddress',
              value: apiLb.loadBalancer.dnsName.apply((dns) => `http://${dns}/WeatherForecast`)
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
        },
        runtimePlatform: {
          cpuArchitecture: "ARM64",
          operatingSystemFamily: "LINUX"
        },
        cpu: "256",
        memory: "512"
    },
    tags: {
      ['env']: 'production',
      ['type']: 'web'
    }
});

export const url = weblb.loadBalancer.dnsName;
