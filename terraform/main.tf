terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Artifact Registry for the Docker container image
resource "google_artifact_registry_repository" "app_repo" {
  location      = var.region
  repository_id = "instant-architect-repo"
  description   = "Docker repository for the Instant Architect application"
  format        = "DOCKER"
}

# 2. Cloud Run Service to host the application
resource "google_cloud_run_v2_service" "app_service" {
  name     = "instant-architect"
  location = var.region

  template {
    containers {
      # Use the image defined by the user (or a placeholder on init)
      image = var.image_url
      
      env {
        name  = "NANO_BANANA_API_KEY"
        value = var.nano_banana_api_key
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      
      ports {
        container_port = 8080
      }
    }
    
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
  }

  # Ignore changes to the image url if updated via gcloud deploying directly
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# 3. Allow public unauthenticated access to the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = google_cloud_run_v2_service.app_service.project
  location = google_cloud_run_v2_service.app_service.location
  name     = google_cloud_run_v2_service.app_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
