output "service_url" {
  value       = google_cloud_run_v2_service.app_service.uri
  description = "The public URL of the deployed Instant Architect application."
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app_repo.repository_id}"
  description = "The full repository path to push Docker images to."
}
