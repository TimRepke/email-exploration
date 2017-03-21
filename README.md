This repository holds code related to the business communication analysis project.

# Components
## Pipeline
The pipeline is used to preprocess raw data and store it in the ArangoDB.
Parts of the pipeline are mostly interchangeable, as long as data one component depends on is present.
One can also implement different sources and sinks.
This can be used to add parts to the pipeline, that tune errors in the database without having to import everything again, while keeping the code for later to run a full import stack.

Check the options available using `python pipeline/main.py --help`.

# Setup

## Get data
There are many versions of the Enron Corpus around:
- https://www.cs.cmu.edu/~./enron/
- ...

Download the original (first) one and store it in `data/original/`.