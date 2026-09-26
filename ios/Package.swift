// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TrustLayer",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(name: "TrustLayer", targets: ["TrustLayer"]),
    ],
    targets: [
        .target(
            name: "TrustLayer",
            path: "Sources/TrustLayer",
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("CoreImage"),
            ]
        ),
    ]
)
