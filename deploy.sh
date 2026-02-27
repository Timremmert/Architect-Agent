#!/bin/bash

# Exit on any error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Instant Architect Deployment Script ===${NC}"

# 1. Load Environment Variables
if [ -f "server/.env" ]; then
    echo "Loading variables from server/.env..."
    export $(grep -v '^#' server/.env | xargs)
else
    echo -e "${YELLOW}Warning: server/.env not found. Ensure GOOGLE_CLOUD_PROJECT is set globally.${NC}"
fi

if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "Error: GOOGLE_CLOUD_PROJECT is not set. Please create server/.env or set it manually."
    exit 1
fi

if [ -z "$GOOGLE_CLOUD_LOCATION" ]; then
    export GOOGLE_CLOUD_LOCATION="europe-west1"
fi

echo "Project ID: $GOOGLE_CLOUD_PROJECT"
echo "Region: $GOOGLE_CLOUD_LOCATION"

# 2. Map standard Env Vars to Terraform Variables
export TF_VAR_project_id=$GOOGLE_CLOUD_PROJECT
export TF_VAR_region=$GOOGLE_CLOUD_LOCATION

IMAGE_NAME="$GOOGLE_CLOUD_LOCATION-docker.pkg.dev/$GOOGLE_CLOUD_PROJECT/instant-architect-repo/instant-architect:latest"

echo -e "\n${GREEN}Step 1: Authenticating with Google Cloud...${NC}"
gcloud auth print-access-token > /dev/null 2>&1 || gcloud auth login
gcloud config set project $GOOGLE_CLOUD_PROJECT

echo -e "\n${GREEN}Step 2: Enabling required Google Cloud APIs...${NC}"
gcloud services enable artifactregistry.googleapis.com run.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com

echo -e "\n${GREEN}Step 3: Initializing Terraform and creating Artifact Registry...${NC}"
cd terraform
terraform init
terraform apply -target=google_artifact_registry_repository.app_repo -auto-approve
cd ..

echo -e "\n${GREEN}Step 4: Building Docker Image...${NC}"
gcloud auth configure-docker $GOOGLE_CLOUD_LOCATION-docker.pkg.dev --quiet
docker build --platform linux/amd64 -t $IMAGE_NAME .

echo -e "\n${GREEN}Step 5: Pushing Docker Image...${NC}"
docker push $IMAGE_NAME

echo -e "\n${GREEN}Step 6: Deploying Cloud Run Service with Terraform...${NC}"
cd terraform
terraform apply -var="image_url=$IMAGE_NAME" -auto-approve

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
