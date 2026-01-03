#!/bin/bash

# Generate tvOS App Icons for React Native Project
# Run this script from the project root: ./scripts/generate-tvos-icons.sh

set -e

# Configuration
SOURCE_ICON="${1:-ios/mediora/Images.xcassets/NewAppIcon.appiconset/media-icon-large.png}"
TVOS_ASSETS_DIR="ios/mediora/Images.xcassets"

echo "🍎 Generating tvOS App Icons..."
echo "Source: $SOURCE_ICON"

# Check if source exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "❌ Source icon not found: $SOURCE_ICON"
    echo "Usage: $0 [path-to-source-icon.png]"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "❌ ImageMagick not found. Install with: brew install imagemagick"
    exit 1
fi

# Create tvOS App Icon folder (layered icons)
TVOS_ICON_DIR="$TVOS_ASSETS_DIR/App Icon & Top Shelf Image.brandassets"
mkdir -p "$TVOS_ICON_DIR"

# Create the brand assets Contents.json
cat > "$TVOS_ICON_DIR/Contents.json" << 'EOF'
{
  "assets" : [
    {
      "filename" : "App Icon - App Store.imagestack",
      "idiom" : "tv",
      "role" : "primary-app-icon",
      "size" : "1280x768"
    },
    {
      "filename" : "App Icon.imagestack",
      "idiom" : "tv",
      "role" : "primary-app-icon",
      "size" : "400x240"
    },
    {
      "filename" : "Top Shelf Image Wide.imageset",
      "idiom" : "tv",
      "role" : "top-shelf-image-wide",
      "size" : "2320x720"
    },
    {
      "filename" : "Top Shelf Image.imageset",
      "idiom" : "tv",
      "role" : "top-shelf-image",
      "size" : "1920x720"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

# ============================================
# App Icon - App Store (Large - 1280x768)
# ============================================
APPSTORE_STACK_DIR="$TVOS_ICON_DIR/App Icon - App Store.imagestack"
mkdir -p "$APPSTORE_STACK_DIR"

cat > "$APPSTORE_STACK_DIR/Contents.json" << 'EOF'
{
  "info" : {
    "author" : "xcode",
    "version" : 1
  },
  "layers" : [
    {
      "filename" : "Front.imagestacklayer"
    },
    {
      "filename" : "Middle.imagestacklayer"
    },
    {
      "filename" : "Back.imagestacklayer"
    }
  ]
}
EOF

# Create layer directories for App Store icon
for LAYER in Front Middle Back; do
    LAYER_DIR="$APPSTORE_STACK_DIR/$LAYER.imagestacklayer"
    CONTENT_DIR="$LAYER_DIR/Content.imageset"
    mkdir -p "$CONTENT_DIR"
    
    cat > "$LAYER_DIR/Contents.json" << 'EOF'
{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
    
    if [ "$LAYER" == "Back" ]; then
        # Back layer gets the full icon
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-back.png",
      "idiom" : "tv",
      "scale" : "1x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        # Generate 1280x768 icon with padding to maintain aspect ratio
        magick "$SOURCE_ICON" -resize 768x768 -gravity center -background transparent -extent 1280x768 "$CONTENT_DIR/icon-back.png"
        echo "  ✓ Generated App Store Back layer (1280x768)"
    elif [ "$LAYER" == "Middle" ]; then
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-middle.png",
      "idiom" : "tv",
      "scale" : "1x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        # Middle layer - transparent for simple icons to avoid double image
        magick -size 1280x768 xc:transparent "$CONTENT_DIR/icon-middle.png"
        echo "  ✓ Generated App Store Middle layer (1280x768)"
    else
        # Front layer - transparent (for parallax effect)
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-front.png",
      "idiom" : "tv",
      "scale" : "1x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        # Front layer - just transparent for simple icons
        magick -size 1280x768 xc:transparent "$CONTENT_DIR/icon-front.png"
        echo "  ✓ Generated App Store Front layer (1280x768)"
    fi
done

# ============================================
# App Icon (Small - 400x240)
# ============================================
SMALL_STACK_DIR="$TVOS_ICON_DIR/App Icon.imagestack"
mkdir -p "$SMALL_STACK_DIR"

cat > "$SMALL_STACK_DIR/Contents.json" << 'EOF'
{
  "info" : {
    "author" : "xcode",
    "version" : 1
  },
  "layers" : [
    {
      "filename" : "Front.imagestacklayer"
    },
    {
      "filename" : "Middle.imagestacklayer"
    },
    {
      "filename" : "Back.imagestacklayer"
    }
  ]
}
EOF

# Create layer directories for small icon
for LAYER in Front Middle Back; do
    LAYER_DIR="$SMALL_STACK_DIR/$LAYER.imagestacklayer"
    CONTENT_DIR="$LAYER_DIR/Content.imageset"
    mkdir -p "$CONTENT_DIR"
    
    cat > "$LAYER_DIR/Contents.json" << 'EOF'
{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
    
    if [ "$LAYER" == "Back" ]; then
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-back.png",
      "idiom" : "tv",
      "scale" : "1x"
    },
    {
      "filename" : "icon-back@2x.png",
      "idiom" : "tv",
      "scale" : "2x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        # 1x: 400x240, 2x: 800x480
        magick "$SOURCE_ICON" -resize 240x240 -gravity center -background transparent -extent 400x240 "$CONTENT_DIR/icon-back.png"
        magick "$SOURCE_ICON" -resize 480x480 -gravity center -background transparent -extent 800x480 "$CONTENT_DIR/icon-back@2x.png"
        echo "  ✓ Generated Small Back layer (400x240 @1x, 800x480 @2x)"
    elif [ "$LAYER" == "Middle" ]; then
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-middle.png",
      "idiom" : "tv",
      "scale" : "1x"
    },
    {
      "filename" : "icon-middle@2x.png",
      "idiom" : "tv",
      "scale" : "2x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        # Middle layer - transparent for simple icons to avoid double image
        magick -size 400x240 xc:transparent "$CONTENT_DIR/icon-middle.png"
        magick -size 800x480 xc:transparent "$CONTENT_DIR/icon-middle@2x.png"
        echo "  ✓ Generated Small Middle layer (400x240 @1x, 800x480 @2x)"
    else
        cat > "$CONTENT_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "icon-front.png",
      "idiom" : "tv",
      "scale" : "1x"
    },
    {
      "filename" : "icon-front@2x.png",
      "idiom" : "tv",
      "scale" : "2x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
        magick -size 400x240 xc:transparent "$CONTENT_DIR/icon-front.png"
        magick -size 800x480 xc:transparent "$CONTENT_DIR/icon-front@2x.png"
        echo "  ✓ Generated Small Front layer (400x240 @1x, 800x480 @2x)"
    fi
done

# ============================================
# Top Shelf Image (1920x720)
# ============================================
TOP_SHELF_DIR="$TVOS_ICON_DIR/Top Shelf Image.imageset"
mkdir -p "$TOP_SHELF_DIR"

cat > "$TOP_SHELF_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "top-shelf.png",
      "idiom" : "tv",
      "scale" : "1x"
    },
    {
      "filename" : "top-shelf@2x.png",
      "idiom" : "tv",
      "scale" : "2x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

# Generate top shelf images (centered icon on dark background)
magick "$SOURCE_ICON" -resize 600x600 -gravity center \
    \( -size 1920x720 xc:'#1a1a2e' \) +swap -gravity center -composite \
    "$TOP_SHELF_DIR/top-shelf.png"
magick "$SOURCE_ICON" -resize 1200x1200 -gravity center \
    \( -size 3840x1440 xc:'#1a1a2e' \) +swap -gravity center -composite \
    "$TOP_SHELF_DIR/top-shelf@2x.png"
echo "  ✓ Generated Top Shelf Image (1920x720 @1x, 3840x1440 @2x)"

# ============================================
# Top Shelf Image Wide (2320x720)
# ============================================
TOP_SHELF_WIDE_DIR="$TVOS_ICON_DIR/Top Shelf Image Wide.imageset"
mkdir -p "$TOP_SHELF_WIDE_DIR"

cat > "$TOP_SHELF_WIDE_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "top-shelf-wide.png",
      "idiom" : "tv",
      "scale" : "1x"
    },
    {
      "filename" : "top-shelf-wide@2x.png",
      "idiom" : "tv",
      "scale" : "2x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

magick "$SOURCE_ICON" -resize 600x600 -gravity center \
    \( -size 2320x720 xc:'#1a1a2e' \) +swap -gravity center -composite \
    "$TOP_SHELF_WIDE_DIR/top-shelf-wide.png"
magick "$SOURCE_ICON" -resize 1200x1200 -gravity center \
    \( -size 4640x1440 xc:'#1a1a2e' \) +swap -gravity center -composite \
    "$TOP_SHELF_WIDE_DIR/top-shelf-wide@2x.png"
echo "  ✓ Generated Top Shelf Image Wide (2320x720 @1x, 4640x1440 @2x)"

echo ""
echo "✅ tvOS icons generated successfully!"
echo ""
echo "📁 Generated assets in:"
echo "   $TVOS_ICON_DIR"
echo ""
echo "📋 Next steps:"
echo "   1. Open the project in Xcode"
echo "   2. Select your tvOS target"
echo "   3. Go to General > App Icons and Launch Screen"
echo "   4. Set App Icon Source to 'App Icon & Top Shelf Image'"
echo ""
