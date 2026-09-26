// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TrustLayer",
    products: [
        .library(name: "TrustLayer", targets: ["TrustLayer"]),
    ],
    targets: [
        .target(name: "TrustLayer", path: "Sources/TrustLayer"),
    ]
)
