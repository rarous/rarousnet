(defproject rarousnet "1.0.0-SNAPSHOT"
  :description "rarous.net web site"
  :url "http://rarous.net/"
  :license {:name "Apache License, Version 2.0"
            :url "https://www.apache.org/licenses/LICENSE-2.0.html"}
  :min-lein-version "2.0.0"
  :main rarousnet.web
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [clj-time "0.7.0"]
                 [compojure "1.1.8"]
                 [enlive "1.1.5"]
                 [environ "0.5.0"]
                 [http-kit "2.1.18"]
                 [ring "1.3.0"]
                 [ring-basic-authentication "1.0.5"]
                 [rm-hull/ring-gzip-middleware "0.1.7"]
  :plugins [[lein-ancient "0.5.5"]
            [lein-environ "0.5.0"]
            [lein-kibit "0.0.8"]
            [lein-midje "3.1.3"]]
  :resource-paths ["src/rarousnet" "resources"]
  :profiles {:dev {:env {:production false}
                   :dependencies [[midje "1.6.3"]]}
