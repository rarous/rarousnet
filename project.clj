(defproject rarousnet "1.0.0-SNAPSHOT"
  :description "rarous.net web site"
  :url "http://rarous.net/"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v20.html"}
  :min-lein-version "2.8.3"
  :main rarousnet.web
  :dependencies [[org.clojure/clojure "1.10.0"]
                 [org.clojure/tools.logging "0.4.1"]
                 [com.cognitect/transit-clj "0.8.313"]
                 [clj-time "0.15.1"]
                 [compojure "1.6.1"]
                 [enlive "1.1.6"]
                 [environ "1.0.2"]
                 [http-kit "2.4.0-alpha2"]
                 [ring/ring-core "1.7.1"]
                 [ring/ring-devel "1.7.1"]
                 [ring/ring-defaults "0.3.2"]]
  :plugins [[lein-cloverage "1.0.13" :exclusions [org.clojure/clojure]]
            [lein-environ "1.0.2"]]
  :resource-paths ["src/rarousnet" "resources"]
  :profiles {:dev {:env {:production false}}
             :production {:env {:production true}}
             :uberjar {:hooks []
                       :env {:production true}
                       :uberjar-name "app-standalone.jar"
                       :omit-source true
                       :aot :all
                       :main rarousnet.web}})
