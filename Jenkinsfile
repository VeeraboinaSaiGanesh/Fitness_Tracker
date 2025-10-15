pipeline {
    agent any
    triggers {
        githubPush()
    }
    environment {
        DOCKER_IMAGE = "gani220/fitness_tracker-master-copy3-fitness-app"
        DOCKER_TAG   = "${BUILD_NUMBER}"
        EKS_CLUSTER_NAME = "g-test-cluster"
        AWS_REGION = "mx-central-1"
        SONARQUBE_ENV = "SonarQube" // Jenkins SonarQube server name
    }
    stages {
        stage('Checkout') {
            steps {
                git credentialsId: 'github_credentials',
                    branch: 'master',
                    url: 'https://github.com/VeeraboinaSaiGanesh/Fitness_Tracker.git'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv("${SONARQUBE_ENV}") {
                    sh """
                        echo "🔍 Running SonarQube analysis..."
                        sonar-scanner \
                            -Dsonar.projectKey=fitness-tracker \
                            -Dsonar.sources=. \
                            -Dsonar.host.url=http://13.48.126.2:9000 \
                            -Dsonar.login=squ_9ba7bfa0b747d3e4e2807891e68ebd6ad50bc616
                    """
                }
            }
        }

        stage('SonarQube a Quality Gate') {
            steps {
                timeout(time: 2, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo "🛠️ Building Docker image..."
                    docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                    docker.build("${DOCKER_IMAGE}:latest")
                }
            }
        }

        stage('Docker Compose Test') {
            steps {
                script {
                    echo "🧪 Testing with Docker Compose..."
                    sh """
                        docker-compose down -v
                        docker-compose build
                        docker-compose up -d
                        sleep 30
                        docker-compose ps

                        i=1
                        while [ \$i -le 5 ]; do
                            if curl -f http://localhost:5000 2>/dev/null; then
                                echo "✅ Application is responding"
                                break
                            fi
                            echo "⏳ Waiting for application... attempt \$i/5"
                            i=\$((i+1))
                            sleep 10
                        done

                        docker-compose logs --tail=10 fitness-app
                    """
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    echo "📦 Pushing Docker image..."
                    docker.withRegistry('https://index.docker.io/v1/', 'Docker_Credentials') {
                        sh """
                            docker push ${DOCKER_IMAGE}:${DOCKER_TAG}
                            docker push ${DOCKER_IMAGE}:latest
                        """
                    }
                    echo "✅ Docker images pushed successfully"
                }
            }
        }

        stage('Deploy Kubernetes') {
            steps {
                withAWS(credentials: 'G_AWS_CRED', region: "${AWS_REGION}") {
                    script {
                        sh """
                            aws eks update-kubeconfig --region ${AWS_REGION} --name ${EKS_CLUSTER_NAME}
                            kubectl apply -f mongodb-deployment.yaml
                            kubectl apply -f app-deployment.yaml
                            kubectl set image deployment/fitness-tracker-app \\
                                fitness-tracker-app=${DOCKER_IMAGE}:${DOCKER_TAG} --record
                            kubectl rollout status deployment/mongodb --timeout=300s
                            kubectl rollout status deployment/fitness-tracker-app --timeout=300s
                            kubectl get deployments
                            kubectl get services
                            kubectl get pods
                        """
                    }
                }
            }
        }

        stage('Get LoadBalancer URL') {
            steps {
                withAWS(credentials: 'G_AWS_CRED', region: "${AWS_REGION}") {
                    script {
                        sh """
                            aws eks update-kubeconfig --region ${AWS_REGION} --name ${EKS_CLUSTER_NAME}
                            i=1
                            while [ \$i -le 10 ]; do
                                EXTERNAL_IP=\$(kubectl get service fitness-tracker-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
                                EXTERNAL_HOSTNAME=\$(kubectl get service fitness-tracker-service -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
                                if [ ! -z "\$EXTERNAL_IP" ]; then
                                    echo "🌐 Application URL: http://\$EXTERNAL_IP"
                                    break
                                elif [ ! -z "\$EXTERNAL_HOSTNAME" ]; then
                                    echo "🌐 Application URL: http://\$EXTERNAL_HOSTNAME"
                                    break
                                fi
                                echo "⏳ Waiting for LoadBalancer... attempt \$i/10"
                                i=\$((i+1))
                                sleep 20
                            done
                            kubectl get service fitness-tracker-service
                            echo "✅ Deployment completed successfully!"
                        """
                    }
                }
            }
        }
    }
    post {
        success {
            echo "✅ Deployment successful!"
        }
        failure {
            echo "❌ Deployment failed!"
        }
    }
}