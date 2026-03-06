#!/bin/bash
# Downloads the latest datadog-serverless-compat binaries from the serverless-components repository

set -e

echo "Fetching latest serverless-compat binary version..."

# Get the latest release tag
RESPONSE=$(curl -s "https://api.github.com/repos/datadog/serverless-components/releases")
SERVERLESS_COMPAT_VERSION=$(echo "$RESPONSE" | jq -r '.[] | select(.tag_name | test("datadog-serverless-compat/v[0-9]+\\.[0-9]+\\.[0-9]+")) | .tag_name' | sort -V | tail -n 1)

if [ -z "$SERVERLESS_COMPAT_VERSION" ]; then
  echo "Error: Could not find serverless-compat release"
  exit 1
fi

echo "Found version: $SERVERLESS_COMPAT_VERSION"

# Download the zip file
TEMP_DIR="./temp"
mkdir -p "$TEMP_DIR"

echo "Downloading binaries..."
curl --output-dir "$TEMP_DIR" --create-dirs -O -s -L "https://github.com/DataDog/serverless-components/releases/download/${SERVERLESS_COMPAT_VERSION}/datadog-serverless-compat.zip"

# Remove old binaries if they exist
if [ -d "./bin" ]; then
  echo "Removing old binaries..."
  rm -rf ./bin
fi

# Unzip the binaries
echo "Extracting binaries..."
unzip -q "$TEMP_DIR/datadog-serverless-compat.zip" -d ./

# Clean up temp directory
rm -rf "$TEMP_DIR"

# List what was extracted
echo ""
echo "Binaries extracted successfully:"
find ./bin -type f -exec ls -lh {} \;

echo ""
echo "Done! Binaries are ready in ./bin directory"
