variable "project_id" {
  type        = string
  description = "The Google Cloud Project ID"
}

variable "region" {
  type        = string
  description = "The region to deploy resources to"
  default     = "europe-west1" 
}

variable "image_url" {
  type        = string
  description = "The URL of the Docker image to deploy. Only used on initial apply."
  default     = "us-docker.pkg.dev/cloudrun/container/hello" # Fallback placeholder
}
