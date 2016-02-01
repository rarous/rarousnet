(defproject rarousnet "1.0.0-SNAPSHOT"
  :description "rarous.net web site"
  :url "http://rarous.net/"
  :license {:name "Apache License, Version 2.0"
            :url "https://www.apache.org/licenses/LICENSE-2.0.html"}
  :min-lein-version "2.5.0"
  :main rarousnet.web
  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/tools.logging "0.3.1"]
                 [clj-time "0.11.0"]
                 [compojure "1.4.0"]
                 [com.cognitect/transit-clj "0.8.281"]
                 [com.logentries/logentries-appender "1.1.30"]
                 [enlive "1.1.6"]
                 [environ "1.0.0"]
                 [http-kit "2.1.19"]
                 [log4j/log4j "1.2.17"]
                 [optimus "0.18.3"]
                 [ring/ring-core "1.4.0"]
                 [ring/ring-codec "1.0.0"]
                 [ring/ring-devel "1.4.0"]
                 [ring/ring-defaults "0.1.5"]
                 [ring-basic-authentication "1.0.5"]
                 [ring.middleware.etag "1.0.0-SNAPSHOT"]
                 [bk/ring-gzip "0.1.1"]]
  :plugins [[lein-environ "0.5.0"]
            [lein-midje "3.1.3"]]
  :resource-paths ["src/rarousnet" "resources"]
  :profiles {:dev {:env {:production false}
                   :dependencies [[midje "1.7.0"]]}
             :production {:env {:production true}}
             :uberjar {:hooks []
                       :env {:production true}
                       :omit-source true
                       :aot :all
                       :main rarousnet.web}})
