// :contracts — pure-Java domain + event contracts.
//
// This is the Java mirror of packages/types (TS). It has NO Spring dependency
// on purpose: it is a plain library other modules (and, later, services)
// depend on. Intentional duplication with packages/types is documented in the
// backend README; a codegen step from a single source of truth is a future
// option, not done here.

plugins {
    `java-library`
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.assertj:assertj-core:3.26.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
