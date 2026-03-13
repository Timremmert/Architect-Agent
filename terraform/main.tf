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

# 2. Service Account for Cloud Run to access Vertex AI
resource "google_service_account" "cloudrun_sa" {
  account_id   = "instant-architect-run-sa"
  display_name = "Instant Architect Cloud Run Service Account"
}

resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# 3. Cloud Run Service to host the application
resource "google_cloud_run_v2_service" "app_service" {
  name     = "instant-architect"
  location = var.region

  template {
    service_account = google_service_account.cloudrun_sa.email

    containers {
      # Use the image defined by the user (or a placeholder on init)
      image = var.image_url
      
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
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



  depends_on = [
    google_project_iam_member.vertex_ai_user
  ]
}

# 4. Allow public unauthenticated access to the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = google_cloud_run_v2_service.app_service.project
  location = google_cloud_run_v2_service.app_service.location
  name     = google_cloud_run_v2_service.app_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
